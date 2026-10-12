#include "RoboORGameState.h"

#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Net/UnrealNetwork.h"
#include "ScenarioEngine.h"
#include "ScenarioLoader.h"
#include "XAPISubsystem.h"

ARoboORGameState::ARoboORGameState() = default;
ARoboORGameState::~ARoboORGameState() = default;

void ARoboORGameState::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(ARoboORGameState, Steps);
	DOREPLIFETIME(ARoboORGameState, Issues);
	DOREPLIFETIME(ARoboORGameState, ScenarioDef);
	DOREPLIFETIME(ARoboORGameState, StartServerTime);
}

UXAPISubsystem* ARoboORGameState::GetXAPI() const
{
	const UGameInstance* GI = GetGameInstance();
	return GI ? GI->GetSubsystem<UXAPISubsystem>() : nullptr;
}

float ARoboORGameState::GetScenarioTime() const
{
	return StartServerTime < 0.f ? 0.f : GetServerWorldTimeSeconds() - StartServerTime;
}

bool ARoboORGameState::IsArmDocked(FName Arm) const
{
	return Engine.IsValid() && Engine->IsArmDocked(Arm);
}

bool ARoboORGameState::StartScenario(const FString& FileName, const FString& InTeamId)
{
	if (!HasAuthority()) return false;
	FString Error;
	FORScenarioDef Def;
	if (!UScenarioLoader::LoadScenarioFile(FileName, Def, Error))
	{
		UE_LOG(LogTemp, Error, TEXT("RoboOR: %s"), *Error);
		return false;
	}
	if (Def.ApprovalStatus != TEXT("approved"))
	{
		UE_LOG(LogTemp, Warning, TEXT("RoboOR: kịch bản %s chưa được hội đồng chuyên môn duyệt (status=%s)"), *Def.Id, *Def.ApprovalStatus);
	}
	ScenarioDef = Def;
	TeamId = InTeamId;
	Engine = MakeUnique<FScenarioEngine>(Def);
	StartServerTime = GetServerWorldTimeSeconds();
	if (UXAPISubsystem* X = GetXAPI())
	{
		X->BeginSession(Def, TeamId);
	}
	SyncFromEngine();
	return true;
}

void ARoboORGameState::ServerHandleAction(FORActionEvent Ev)
{
	if (!HasAuthority() || !Engine.IsValid()) return;
	Ev.Time = GetScenarioTime();
	const FORFeedback Fb = Engine->Handle(Ev);
	if (UXAPISubsystem* X = GetXAPI())
	{
		if (!Fb.StepCompleted.IsNone()) X->SendStepCompleted(Ev, Fb.StepCompleted, !Fb.Issue.IsSet());
		if (Fb.Issue.IsSet()) X->SendIssue(Fb.Issue.GetValue());
	}
	SyncFromEngine();
	MulticastFeedback(Fb.bOk, Fb.Message, Ev.Role);
	if (Engine->IsFinished())
	{
		FinishScenario();
	}
}

void ARoboORGameState::ServerReportIssue(FORIssue Issue)
{
	if (!HasAuthority() || !Engine.IsValid() || Engine->IsFinished()) return;
	Issue.Time = GetScenarioTime();
	Engine->AddIssue(Issue);
	if (UXAPISubsystem* X = GetXAPI()) X->SendIssue(Issue);
	SyncFromEngine();
	MulticastFeedback(false, Issue.Message, Issue.Role);
}

FORResult ARoboORGameState::FinishScenario()
{
	FORResult R;
	if (!HasAuthority() || !Engine.IsValid()) return R;
	R = Engine->Terminate(GetScenarioTime());
	if (UXAPISubsystem* X = GetXAPI()) X->EndSession(R);
	SyncFromEngine();
	MulticastFinished(R);
	return R;
}

void ARoboORGameState::SyncFromEngine()
{
	Steps = Engine->GetStepStates();
	Issues = Engine->GetIssues();
	OnRep_Steps(); // máy chủ không tự gọi OnRep
}

void ARoboORGameState::OnRep_Steps()
{
	OnStepsChanged.Broadcast();
}

void ARoboORGameState::MulticastFeedback_Implementation(bool bOk, const FText& Message, FName Role)
{
	OnFeedback.Broadcast(bOk, Message, Role);
}

void ARoboORGameState::MulticastFinished_Implementation(const FORResult& Result)
{
	OnFinished.Broadcast(Result);
}
