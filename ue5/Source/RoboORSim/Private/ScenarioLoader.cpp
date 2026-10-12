#include "ScenarioLoader.h"

#include "Dom/JsonObject.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace
{
	TArray<FName> ReadNames(const TSharedPtr<FJsonObject>& Obj, const FString& Field)
	{
		TArray<FName> Out;
		const TArray<TSharedPtr<FJsonValue>>* Arr = nullptr;
		if (Obj->TryGetArrayField(Field, Arr))
		{
			for (const TSharedPtr<FJsonValue>& V : *Arr)
			{
				Out.Add(FName(*V->AsString()));
			}
		}
		return Out;
	}

	EORSeverity ParseSeverity(const FString& S)
	{
		if (S == TEXT("critical")) return EORSeverity::Critical;
		if (S == TEXT("major")) return EORSeverity::Major;
		return EORSeverity::Minor;
	}

	/** Phát hiện vòng lặp phụ thuộc giữa các bước bằng duyệt sâu */
	bool HasCycle(const FORScenarioDef& Def)
	{
		TMap<FName, int32> Mark; // 0 = chưa, 1 = đang duyệt, 2 = xong
		TFunction<bool(FName)> Visit = [&](FName N) -> bool
		{
			int32& M = Mark.FindOrAdd(N);
			if (M == 1) return true;
			if (M == 2) return false;
			M = 1;
			if (const FORStepDef* S = Def.FindStep(N))
			{
				for (const FName& A : S->After)
				{
					if (Visit(A)) return true;
				}
			}
			Mark[N] = 2;
			return false;
		};
		for (const FORStepDef& S : Def.Steps)
		{
			if (Visit(S.Id)) return true;
		}
		return false;
	}
}

bool UScenarioLoader::ParseScenario(const FString& Json, FORScenarioDef& Out, FString& OutError)
{
	TSharedPtr<FJsonObject> Root;
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Json);
	if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
	{
		OutError = TEXT("JSON không hợp lệ");
		return false;
	}
	for (const TCHAR* Key : {TEXT("id"), TEXT("version"), TEXT("module"), TEXT("title"), TEXT("roles"), TEXT("steps")})
	{
		if (!Root->HasField(Key))
		{
			OutError = FString::Printf(TEXT("thiếu trường bắt buộc '%s'"), Key);
			return false;
		}
	}

	Out = FORScenarioDef();
	Out.Id = Root->GetStringField(TEXT("id"));
	Out.Version = Root->GetStringField(TEXT("version"));
	Out.Module = static_cast<int32>(Root->GetNumberField(TEXT("module")));
	Out.Title = FText::FromString(Root->GetStringField(TEXT("title")));
	Out.Roles = ReadNames(Root, TEXT("roles"));
	double Limit = -1.0;
	if (Root->TryGetNumberField(TEXT("time_limit_s"), Limit)) Out.TimeLimitS = static_cast<float>(Limit);

	const TSharedPtr<FJsonObject>* Approval = nullptr;
	if (Root->TryGetObjectField(TEXT("approval"), Approval))
	{
		(*Approval)->TryGetStringField(TEXT("status"), Out.ApprovalStatus);
	}
	const TSharedPtr<FJsonObject>* Init = nullptr;
	if (Root->TryGetObjectField(TEXT("initial_state"), Init))
	{
		Out.InitialDockedArms = ReadNames(*Init, TEXT("docked_arms"));
		Out.InitialInstrumentsIn = ReadNames(*Init, TEXT("instruments_in"));
		(*Init)->TryGetBoolField(TEXT("camera_in"), Out.bInitialCameraIn);
	}

	for (const TSharedPtr<FJsonValue>& V : Root->GetArrayField(TEXT("steps")))
	{
		const TSharedPtr<FJsonObject> S = V->AsObject();
		FORStepDef D;
		D.Id = FName(*S->GetStringField(TEXT("id")));
		D.Title = FText::FromString(S->GetStringField(TEXT("title")));
		D.Roles = ReadNames(S, TEXT("roles"));
		D.Action = FName(*S->GetStringField(TEXT("action")));
		D.After = ReadNames(S, TEXT("after"));
		S->TryGetBoolField(TEXT("critical"), D.bCritical);
		FString Target;
		if (S->TryGetStringField(TEXT("target"), Target)) D.Target = FName(*Target);
		D.Targets = ReadNames(S, TEXT("targets"));
		double MinDur = -1.0;
		if (S->TryGetNumberField(TEXT("min_duration_s"), MinDur)) D.MinDurationS = static_cast<float>(MinDur);
		for (const FName& R : D.Roles)
		{
			if (!Out.Roles.Contains(R))
			{
				OutError = FString::Printf(TEXT("bước %s: vai trò '%s' không có trong roles"), *D.Id.ToString(), *R.ToString());
				return false;
			}
		}
		Out.Steps.Add(D);
	}
	for (const FORStepDef& D : Out.Steps)
	{
		for (const FName& A : D.After)
		{
			if (!Out.FindStep(A))
			{
				OutError = FString::Printf(TEXT("bước %s: điều kiện trước '%s' không tồn tại"), *D.Id.ToString(), *A.ToString());
				return false;
			}
		}
	}
	if (HasCycle(Out))
	{
		OutError = TEXT("phụ thuộc giữa các bước bị vòng lặp");
		return false;
	}

	const TArray<TSharedPtr<FJsonValue>>* Rules = nullptr;
	if (Root->TryGetArrayField(TEXT("rules"), Rules))
	{
		for (const TSharedPtr<FJsonValue>& V : *Rules)
		{
			const TSharedPtr<FJsonObject> R = V->AsObject();
			FORRuleDef D;
			D.Id = FName(*R->GetStringField(TEXT("id")));
			D.Action = FName(*R->GetStringField(TEXT("action")));
			D.IfState = FName(*R->GetStringField(TEXT("if_state")));
			D.Severity = ParseSeverity(R->GetStringField(TEXT("severity")));
			D.Message = FText::FromString(R->GetStringField(TEXT("message")));
			if (D.IfState != TEXT("any_arm_docked") && D.IfState != TEXT("target_has_instrument"))
			{
				OutError = FString::Printf(TEXT("luật %s: if_state chưa được hỗ trợ"), *D.Id.ToString());
				return false;
			}
			Out.Rules.Add(D);
		}
	}

	const TSharedPtr<FJsonObject>* Sc = nullptr;
	if (Root->TryGetObjectField(TEXT("scoring"), Sc))
	{
		double N = 0;
		if ((*Sc)->TryGetNumberField(TEXT("critical_miss"), N)) Out.Scoring.CriticalMiss = static_cast<float>(N);
		if ((*Sc)->TryGetNumberField(TEXT("critical_error"), N)) Out.Scoring.CriticalError = static_cast<float>(N);
		if ((*Sc)->TryGetNumberField(TEXT("out_of_order"), N)) Out.Scoring.OutOfOrder = static_cast<float>(N);
		if ((*Sc)->TryGetNumberField(TEXT("wrong_role"), N)) Out.Scoring.WrongRole = static_cast<float>(N);
		if ((*Sc)->TryGetNumberField(TEXT("over_time_per_10s"), N)) Out.Scoring.OverTimePer10s = static_cast<float>(N);
		if ((*Sc)->TryGetNumberField(TEXT("pass_threshold"), N)) Out.Scoring.PassThreshold = static_cast<float>(N);
		(*Sc)->TryGetBoolField(TEXT("fail_on_any_critical_error"), Out.Scoring.bFailOnAnyCriticalError);
	}
	return true;
}

bool UScenarioLoader::LoadScenarioFile(const FString& FileName, FORScenarioDef& OutDef, FString& OutError)
{
	const FString Path = FPaths::Combine(FPaths::ProjectContentDir(), TEXT("Scenarios"), FileName);
	FString Json;
	if (!FFileHelper::LoadFileToString(Json, *Path))
	{
		OutError = FString::Printf(TEXT("không đọc được %s"), *Path);
		return false;
	}
	return ParseScenario(Json, OutDef, OutError);
}
