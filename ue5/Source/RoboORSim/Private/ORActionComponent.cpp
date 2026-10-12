#include "ORActionComponent.h"

#include "Engine/World.h"
#include "Net/UnrealNetwork.h"
#include "RoboORGameState.h"

UORActionComponent::UORActionComponent()
{
	SetIsReplicatedByDefault(true);
}

void UORActionComponent::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(UORActionComponent, Role);
	DOREPLIFETIME(UORActionComponent, LearnerId);
}

void UORActionComponent::SubmitAction(FName Action, FName Target, float DurationS)
{
	if (GetOwner() && GetOwner()->HasAuthority())
	{
		ServerSubmitAction_Implementation(Action, Target, DurationS);
	}
	else
	{
		ServerSubmitAction(Action, Target, DurationS);
	}
}

void UORActionComponent::ServerSubmitAction_Implementation(FName Action, FName Target, float DurationS)
{
	ARoboORGameState* GS = GetWorld() ? GetWorld()->GetGameState<ARoboORGameState>() : nullptr;
	if (!GS) return;
	FORActionEvent Ev;
	Ev.LearnerId = LearnerId;
	Ev.Role = Role;          // vai trò lấy từ máy chủ, không tin giá trị client gửi lên
	Ev.Action = Action;
	Ev.Target = Target;
	Ev.DurationS = DurationS;
	GS->ServerHandleAction(Ev);
}
