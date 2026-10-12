#include "ScenarioEngine.h"

#define LOCTEXT_NAMESPACE "RoboOR"

namespace ORKinds
{
	static const FName OutOfOrder(TEXT("out_of_order"));
	static const FName WrongRole(TEXT("wrong_role"));
	static const FName Rule(TEXT("rule"));
	static const FName InsufficientDuration(TEXT("insufficient_duration"));
	static const FName Unexpected(TEXT("unexpected"));
}

namespace ORActions
{
	static const FName RemoveInstrument(TEXT("remove_instrument"));
	static const FName RemoveCamera(TEXT("remove_camera"));
	static const FName UndockArm(TEXT("undock_arm"));
	static const FName MoveCartAway(TEXT("move_cart_away"));
	static const FName Camera(TEXT("camera"));
}

FScenarioEngine::FScenarioEngine(const FORScenarioDef& InDef)
	: Def(InDef)
{
	Docked = TSet<FName>(Def.InitialDockedArms);
	InstrumentsIn = TSet<FName>(Def.InitialInstrumentsIn);
	bCameraIn = Def.bInitialCameraIn;
	bCartAtTable = Docked.Num() > 0;
}

bool FScenarioEngine::StateTrue(FName State, FName Target) const
{
	if (State == TEXT("any_arm_docked"))
	{
		return Docked.Num() > 0;
	}
	if (State == TEXT("target_has_instrument"))
	{
		return Target == ORActions::Camera ? bCameraIn : InstrumentsIn.Contains(Target);
	}
	return false;
}

void FScenarioEngine::ApplyEffect(const FORActionEvent& Ev)
{
	if (Ev.Action == ORActions::RemoveInstrument)      { InstrumentsIn.Remove(Ev.Target); }
	else if (Ev.Action == ORActions::RemoveCamera)     { bCameraIn = false; }
	else if (Ev.Action == ORActions::UndockArm)        { Docked.Remove(Ev.Target); }
	else if (Ev.Action == ORActions::MoveCartAway)     { bCartAtTable = false; }
}

FORIssue FScenarioEngine::MakeIssue(const FORActionEvent& Ev, FName Kind, EORSeverity Sev, const FText& Msg, FName Ref)
{
	FORIssue I;
	I.Time = Ev.Time;
	I.Kind = Kind;
	I.Severity = Sev;
	I.Message = Msg;
	I.LearnerId = Ev.LearnerId;
	I.Role = Ev.Role;
	I.Ref = Ref;
	Issues.Add(I);
	return I;
}

void FScenarioEngine::AddIssue(const FORIssue& Issue)
{
	if (!bFinished)
	{
		Issues.Add(Issue);
	}
}

const FORStepDef* FScenarioEngine::MatchStep(const FORActionEvent& Ev) const
{
	for (const FORStepDef& S : Def.Steps)
	{
		if (Done.Contains(S.Id) || S.Action != Ev.Action) continue;
		if (!S.Target.IsNone() && S.Target != Ev.Target) continue;
		if (S.Targets.Num() > 0)
		{
			if (!S.Targets.Contains(Ev.Target)) continue;
			const TSet<FName>* Got = Partial.Find(S.Id);
			if (Got && Got->Contains(Ev.Target)) continue;
		}
		return &S;
	}
	return nullptr;
}

FORFeedback FScenarioEngine::Handle(const FORActionEvent& Ev)
{
	FORFeedback Fb;
	if (bFinished)
	{
		Fb.bOk = false;
		Fb.Message = LOCTEXT("Finished", "Buổi đã kết thúc");
		return Fb;
	}
	LastTime = FMath::Max(LastTime, Ev.Time);

	// 1) Luật an toàn: hành động nguy hiểm bị chặn và không tạo hiệu ứng
	for (const FORRuleDef& R : Def.Rules)
	{
		if (R.Action == Ev.Action && StateTrue(R.IfState, Ev.Target))
		{
			Fb.bOk = false;
			Fb.Issue = MakeIssue(Ev, ORKinds::Rule, R.Severity, R.Message, R.Id);
			Fb.Message = R.Message;
			return Fb;
		}
	}

	// 2) Khớp bước
	const FORStepDef* Step = MatchStep(Ev);
	if (!Step)
	{
		Fb.bOk = false;
		Fb.Message = FText::Format(LOCTEXT("Unexpected", "Hành động '{0}' không có trong kịch bản ở thời điểm này"), FText::FromName(Ev.Action));
		Fb.Issue = MakeIssue(Ev, ORKinds::Unexpected, EORSeverity::Minor, Fb.Message, NAME_None);
		ApplyEffect(Ev);
		return Fb;
	}

	if (!Step->Roles.Contains(Ev.Role))
	{
		Fb.bOk = false;
		Fb.Message = FText::Format(LOCTEXT("WrongRole", "'{0}' không thuộc vai trò {1}"), Step->Title, FText::FromName(Ev.Role));
		Fb.Issue = MakeIssue(Ev, ORKinds::WrongRole, EORSeverity::Minor, Fb.Message, Step->Id);
		return Fb;
	}

	if (Step->MinDurationS >= 0.f && Ev.DurationS < Step->MinDurationS)
	{
		Fb.bOk = false;
		Fb.Message = FText::Format(LOCTEXT("TooShort", "'{0}' chưa đủ {1} giây"), Step->Title, FText::AsNumber(Step->MinDurationS));
		Fb.Issue = MakeIssue(Ev, ORKinds::InsufficientDuration, EORSeverity::Critical, Fb.Message, Step->Id);
		return Fb;
	}

	TArray<FText> Missing;
	for (const FName& A : Step->After)
	{
		if (!Done.Contains(A))
		{
			const FORStepDef* Pre = Def.FindStep(A);
			Missing.Add(Pre ? Pre->Title : FText::FromName(A));
		}
	}
	if (Missing.Num() > 0)
	{
		const FText Msg = FText::Format(LOCTEXT("OutOfOrder", "Làm '{0}' trước khi xong: {1}"), Step->Title, FText::Join(FText::FromString(TEXT(", ")), Missing));
		Fb.Issue = MakeIssue(Ev, ORKinds::OutOfOrder, EORSeverity::Major, Msg, Step->Id);
		Fb.bOk = false;
	}

	ApplyEffect(Ev);

	if (Step->Targets.Num() > 0)
	{
		TSet<FName>& Got = Partial.FindOrAdd(Step->Id);
		Got.Add(Ev.Target);
		if (Got.Num() < Step->Targets.Num())
		{
			Fb.Message = FText::Format(LOCTEXT("Partial", "{0}: {1}/{2}"), Step->Title, FText::AsNumber(Got.Num()), FText::AsNumber(Step->Targets.Num()));
			return Fb;
		}
	}

	Done.Add(Step->Id, FDoneInfo{Ev.Time, Ev.LearnerId, Ev.Role});
	Fb.StepCompleted = Step->Id;
	Fb.Message = FText::Format(LOCTEXT("Done", "Hoàn thành: {0}"), Step->Title);
	if (Done.Num() == Def.Steps.Num())
	{
		bFinished = true;
	}
	return Fb;
}

TArray<FORStepState> FScenarioEngine::GetStepStates() const
{
	TArray<FORStepState> Out;
	for (const FORStepDef& S : Def.Steps)
	{
		FORStepState St;
		St.Id = S.Id;
		St.Total = FMath::Max(1, S.Targets.Num());
		if (const FDoneInfo* D = Done.Find(S.Id))
		{
			St.bDone = true;
			St.DoneAt = D->Time;
			St.DoneByRole = D->Role;
			St.Progress = St.Total;
		}
		else if (const TSet<FName>* P = Partial.Find(S.Id))
		{
			St.Progress = P->Num();
		}
		Out.Add(St);
	}
	return Out;
}

FORResult FScenarioEngine::Terminate(float AtTime)
{
	bFinished = true;
	LastTime = FMath::Max(LastTime, AtTime);
	const FORScoring& Sc = Def.Scoring;

	FORResult R;
	for (const FORStepDef& S : Def.Steps)
	{
		if (S.bCritical && !Done.Contains(S.Id)) R.MissedCritical.Add(S.Id);
	}
	int32 NOut = 0, NRole = 0;
	for (const FORIssue& I : Issues)
	{
		if (I.Severity == EORSeverity::Critical) ++R.NumCriticalErrors;
		if (I.Kind == ORKinds::OutOfOrder) ++NOut;
		if (I.Kind == ORKinds::WrongRole) ++NRole;
	}
	float Score = 100.f;
	Score -= Sc.CriticalMiss * R.MissedCritical.Num();
	Score -= Sc.CriticalError * R.NumCriticalErrors;
	Score -= Sc.OutOfOrder * NOut;
	Score -= Sc.WrongRole * NRole;
	if (Def.TimeLimitS > 0.f && LastTime > Def.TimeLimitS && Sc.OverTimePer10s > 0.f)
	{
		Score -= Sc.OverTimePer10s * FMath::CeilToFloat((LastTime - Def.TimeLimitS) / 10.f);
	}
	R.Score = FMath::Max(0.f, FMath::RoundToFloat(Score * 10.f) / 10.f);
	R.DurationS = LastTime;
	R.NumIssues = Issues.Num();
	R.bPassed = R.Score >= Sc.PassThreshold && R.MissedCritical.Num() == 0 && !(Sc.bFailOnAnyCriticalError && R.NumCriticalErrors > 0);
	return R;
}

#undef LOCTEXT_NAMESPACE
