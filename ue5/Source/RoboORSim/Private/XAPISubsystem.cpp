#include "XAPISubsystem.h"

#include "Dom/JsonObject.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

namespace
{
	const TCHAR* ADL = TEXT("http://adlnet.gov/expapi/verbs/");

	FString Guid() { return FGuid::NewGuid().ToString(EGuidFormats::DigitsWithHyphensLower); }

	TSharedRef<FJsonObject> LangMap(const FString& Text)
	{
		TSharedRef<FJsonObject> M = MakeShared<FJsonObject>();
		M->SetStringField(TEXT("vi-VN"), Text);
		return M;
	}

	FString SeverityStr(EORSeverity S)
	{
		switch (S)
		{
		case EORSeverity::Critical: return TEXT("critical");
		case EORSeverity::Major: return TEXT("major");
		default: return TEXT("minor");
		}
	}
}

FString UXAPISubsystem::Timestamp(float T) const
{
	return (StartUtc + FTimespan::FromSeconds(T)).ToIso8601();
}

TSharedRef<FJsonObject> UXAPISubsystem::Agent(const FString& LearnerId) const
{
	TSharedRef<FJsonObject> Acc = MakeShared<FJsonObject>();
	Acc->SetStringField(TEXT("homePage"), BaseIri);
	Acc->SetStringField(TEXT("name"), LearnerId);
	TSharedRef<FJsonObject> A = MakeShared<FJsonObject>();
	A->SetStringField(TEXT("objectType"), TEXT("Agent"));
	A->SetObjectField(TEXT("account"), Acc);
	return A;
}

TSharedRef<FJsonObject> UXAPISubsystem::ScenarioActivity() const
{
	TSharedRef<FJsonObject> Defn = MakeShared<FJsonObject>();
	Defn->SetObjectField(TEXT("name"), LangMap(Def.Title.ToString()));
	Defn->SetStringField(TEXT("type"), TEXT("http://adlnet.gov/expapi/activities/simulation"));
	TSharedRef<FJsonObject> Ext = MakeShared<FJsonObject>();
	Ext->SetStringField(BaseIri + TEXT("/ext/approval-status"), Def.ApprovalStatus);
	Defn->SetObjectField(TEXT("extensions"), Ext);
	TSharedRef<FJsonObject> O = MakeShared<FJsonObject>();
	O->SetStringField(TEXT("objectType"), TEXT("Activity"));
	O->SetStringField(TEXT("id"), FString::Printf(TEXT("%s/scenario/%s/%s"), *BaseIri, *Def.Id, *Def.Version));
	O->SetObjectField(TEXT("definition"), Defn);
	return O;
}

TSharedRef<FJsonObject> UXAPISubsystem::StepActivity(FName StepId) const
{
	const FORStepDef* S = Def.FindStep(StepId);
	TSharedRef<FJsonObject> Defn = MakeShared<FJsonObject>();
	Defn->SetObjectField(TEXT("name"), LangMap(S ? S->Title.ToString() : StepId.ToString()));
	Defn->SetStringField(TEXT("type"), TEXT("http://adlnet.gov/expapi/activities/interaction"));
	TSharedRef<FJsonObject> O = MakeShared<FJsonObject>();
	O->SetStringField(TEXT("objectType"), TEXT("Activity"));
	O->SetStringField(TEXT("id"), FString::Printf(TEXT("%s/scenario/%s/%s/step/%s"), *BaseIri, *Def.Id, *Def.Version, *StepId.ToString()));
	O->SetObjectField(TEXT("definition"), Defn);
	return O;
}

TSharedRef<FJsonObject> UXAPISubsystem::MakeStatement(const TSharedRef<FJsonObject>& Actor, const FString& VerbKey,
                                                      const TSharedRef<FJsonObject>& Object, float T, FName Role) const
{
	TSharedRef<FJsonObject> Verb = MakeShared<FJsonObject>();
	Verb->SetStringField(TEXT("id"), VerbKey == TEXT("erred") ? BaseIri + TEXT("/verbs/erred") : FString(ADL) + VerbKey);
	Verb->SetObjectField(TEXT("display"), LangMap(VerbKey));

	TSharedRef<FJsonObject> Ext = MakeShared<FJsonObject>();
	Ext->SetStringField(BaseIri + TEXT("/ext/team"), TeamId);
	Ext->SetNumberField(BaseIri + TEXT("/ext/module"), Def.Module);
	if (!Role.IsNone()) Ext->SetStringField(BaseIri + TEXT("/ext/role"), Role.ToString());

	TSharedRef<FJsonObject> Parent = MakeShared<FJsonObject>();
	Parent->SetStringField(TEXT("id"), FString::Printf(TEXT("%s/scenario/%s/%s"), *BaseIri, *Def.Id, *Def.Version));
	TSharedRef<FJsonObject> CA = MakeShared<FJsonObject>();
	TArray<TSharedPtr<FJsonValue>> Parents;
	Parents.Add(MakeShared<FJsonValueObject>(Parent));
	CA->SetArrayField(TEXT("parent"), Parents);

	TSharedRef<FJsonObject> Ctx = MakeShared<FJsonObject>();
	Ctx->SetStringField(TEXT("registration"), Registration);
	Ctx->SetObjectField(TEXT("contextActivities"), CA);
	Ctx->SetObjectField(TEXT("extensions"), Ext);

	TSharedRef<FJsonObject> S = MakeShared<FJsonObject>();
	S->SetStringField(TEXT("id"), Guid());
	S->SetObjectField(TEXT("actor"), Actor);
	S->SetObjectField(TEXT("verb"), Verb);
	S->SetObjectField(TEXT("object"), Object);
	S->SetObjectField(TEXT("context"), Ctx);
	S->SetStringField(TEXT("timestamp"), Timestamp(T));
	S->SetStringField(TEXT("version"), TEXT("1.0.3"));
	return S;
}

void UXAPISubsystem::BeginSession(const FORScenarioDef& InDef, const FString& InTeamId)
{
	Def = InDef;
	TeamId = InTeamId;
	Registration = Guid();
	StartUtc = FDateTime::UtcNow();
	Learners.Reset();
}

void UXAPISubsystem::SendStepCompleted(const FORActionEvent& Ev, FName StepId, bool bSuccess)
{
	Learners.Add(Ev.LearnerId);
	TSharedRef<FJsonObject> S = MakeStatement(Agent(Ev.LearnerId), TEXT("completed"), StepActivity(StepId), Ev.Time, Ev.Role);
	TSharedRef<FJsonObject> R = MakeShared<FJsonObject>();
	R->SetBoolField(TEXT("completion"), true);
	R->SetBoolField(TEXT("success"), bSuccess);
	S->SetObjectField(TEXT("result"), R);
	Post({S});
}

void UXAPISubsystem::SendIssue(const FORIssue& I)
{
	Learners.Add(I.LearnerId);
	const bool bStep = I.Ref.IsNone() ? false : Def.FindStep(I.Ref) != nullptr;
	TSharedRef<FJsonObject> S = MakeStatement(Agent(I.LearnerId), TEXT("erred"), bStep ? StepActivity(I.Ref) : ScenarioActivity(), I.Time, I.Role);
	TSharedRef<FJsonObject> Ext = MakeShared<FJsonObject>();
	Ext->SetStringField(BaseIri + TEXT("/ext/issue-kind"), I.Kind.ToString());
	Ext->SetStringField(BaseIri + TEXT("/ext/severity"), SeverityStr(I.Severity));
	TSharedRef<FJsonObject> R = MakeShared<FJsonObject>();
	R->SetBoolField(TEXT("success"), false);
	R->SetStringField(TEXT("response"), I.Message.ToString());
	R->SetObjectField(TEXT("extensions"), Ext);
	S->SetObjectField(TEXT("result"), R);
	Post({S});
}

void UXAPISubsystem::EndSession(const FORResult& Res)
{
	TArray<TSharedPtr<FJsonValue>> Members;
	for (const FString& L : Learners) Members.Add(MakeShared<FJsonValueObject>(Agent(L)));
	TSharedRef<FJsonObject> Group = MakeShared<FJsonObject>();
	Group->SetStringField(TEXT("objectType"), TEXT("Group"));
	Group->SetStringField(TEXT("name"), TeamId);
	Group->SetArrayField(TEXT("member"), Members);

	TSharedRef<FJsonObject> Score = MakeShared<FJsonObject>();
	Score->SetNumberField(TEXT("raw"), Res.Score);
	Score->SetNumberField(TEXT("min"), 0);
	Score->SetNumberField(TEXT("max"), 100);
	Score->SetNumberField(TEXT("scaled"), Res.Score / 100.0);
	TArray<TSharedPtr<FJsonValue>> Missed;
	for (const FName& M : Res.MissedCritical) Missed.Add(MakeShared<FJsonValueString>(M.ToString()));
	TSharedRef<FJsonObject> Ext = MakeShared<FJsonObject>();
	Ext->SetArrayField(BaseIri + TEXT("/ext/missed-critical"), Missed);
	Ext->SetNumberField(BaseIri + TEXT("/ext/critical-errors"), Res.NumCriticalErrors);
	Ext->SetNumberField(BaseIri + TEXT("/ext/issue-count"), Res.NumIssues);
	TSharedRef<FJsonObject> R = MakeShared<FJsonObject>();
	R->SetObjectField(TEXT("score"), Score);
	R->SetBoolField(TEXT("success"), Res.bPassed);
	R->SetBoolField(TEXT("completion"), Res.MissedCritical.Num() == 0);
	R->SetStringField(TEXT("duration"), FString::Printf(TEXT("PT%gS"), Res.DurationS));
	R->SetObjectField(TEXT("extensions"), Ext);

	TSharedRef<FJsonObject> Final = MakeStatement(Group, Res.bPassed ? TEXT("passed") : TEXT("failed"), ScenarioActivity(), Res.DurationS, NAME_None);
	Final->SetObjectField(TEXT("result"), R);
	Post({Final, MakeStatement(Group, TEXT("terminated"), ScenarioActivity(), Res.DurationS, NAME_None)});
}

void UXAPISubsystem::Post(TArray<TSharedPtr<FJsonObject>> Statements)
{
	TArray<TSharedPtr<FJsonValue>> Arr;
	for (const TSharedPtr<FJsonObject>& S : Statements) Arr.Add(MakeShared<FJsonValueObject>(S));
	FString Body;
	const TSharedRef<TJsonWriter<>> W = TJsonWriterFactory<>::Create(&Body);
	FJsonSerializer::Serialize(Arr, W);

	FlushPending();
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = FHttpModule::Get().CreateRequest();
	Req->SetURL(Endpoint);
	Req->SetVerb(TEXT("POST"));
	Req->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Req->SetHeader(TEXT("X-Experience-API-Version"), TEXT("1.0.3"));
	if (!Token.IsEmpty()) Req->SetHeader(TEXT("Authorization"), TEXT("Bearer ") + Token);
	Req->SetContentAsString(Body);
	TWeakObjectPtr<UXAPISubsystem> WeakThis(this);
	Req->OnProcessRequestComplete().BindLambda([WeakThis, Body](FHttpRequestPtr, FHttpResponsePtr Resp, bool bOk)
	{
		if (!WeakThis.IsValid()) return;
		if (!bOk || !Resp.IsValid() || Resp->GetResponseCode() >= 500)
		{
			WeakThis->Pending.Add(Body);   // lỗi mạng hoặc máy chủ: giữ lại để gửi lại
		}
		else if (Resp->GetResponseCode() >= 400)
		{
			UE_LOG(LogTemp, Error, TEXT("xAPI bị từ chối (%d): %s"), Resp->GetResponseCode(), *Resp->GetContentAsString());
		}
	});
	Req->ProcessRequest();
}

void UXAPISubsystem::FlushPending()
{
	if (Pending.Num() == 0) return;
	TArray<FString> Batch = MoveTemp(Pending);
	Pending.Reset();
	for (const FString& Body : Batch)
	{
		TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = FHttpModule::Get().CreateRequest();
		Req->SetURL(Endpoint);
		Req->SetVerb(TEXT("POST"));
		Req->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
		Req->SetHeader(TEXT("X-Experience-API-Version"), TEXT("1.0.3"));
		if (!Token.IsEmpty()) Req->SetHeader(TEXT("Authorization"), TEXT("Bearer ") + Token);
		Req->SetContentAsString(Body);
		TWeakObjectPtr<UXAPISubsystem> WeakThis(this);
		Req->OnProcessRequestComplete().BindLambda([WeakThis, Body](FHttpRequestPtr, FHttpResponsePtr Resp, bool bOk)
		{
			if (WeakThis.IsValid() && (!bOk || !Resp.IsValid() || Resp->GetResponseCode() >= 500)) WeakThis->Pending.Add(Body);
		});
		Req->ProcessRequest();
	}
}
