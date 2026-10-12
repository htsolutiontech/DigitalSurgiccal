#include "SterileComponents.h"

#include "Engine/World.h"
#include "Net/UnrealNetwork.h"
#include "ORActionComponent.h"
#include "RoboORGameState.h"

#define LOCTEXT_NAMESPACE "RoboOR"

UHandSterilityComponent::UHandSterilityComponent()
{
	SetIsReplicatedByDefault(true);
	InitSphereRadius(5.f); // cm
	SetGenerateOverlapEvents(true);
}

void UHandSterilityComponent::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(UHandSterilityComponent, bSterile);
}

USterileFieldComponent::USterileFieldComponent()
{
	SetGenerateOverlapEvents(true);
	ShapeColor = FColor(46, 204, 113);
}

void USterileFieldComponent::BeginPlay()
{
	Super::BeginPlay();
	OnComponentBeginOverlap.AddDynamic(this, &USterileFieldComponent::HandleOverlap);
}

void USterileFieldComponent::HandleOverlap(UPrimitiveComponent*, AActor* OtherActor, UPrimitiveComponent* OtherComp,
                                           int32, bool, const FHitResult&)
{
	if (!GetOwner() || !GetOwner()->HasAuthority()) return;           // chỉ máy chủ chấm
	const UHandSterilityComponent* Hand = Cast<UHandSterilityComponent>(OtherComp);
	if (!Hand || Hand->bSterile) return;

	const float Now = GetWorld()->GetTimeSeconds();
	if (const float* Last = LastReport.Find(OtherComp); Last && Now - *Last < CooldownS) return;
	LastReport.Add(OtherComp, Now);

	ARoboORGameState* GS = GetWorld()->GetGameState<ARoboORGameState>();
	if (!GS) return;
	FORIssue I;
	I.Kind = TEXT("sterile_breach");
	I.Severity = EORSeverity::Critical;
	I.Message = FText::Format(LOCTEXT("Breach", "Bộ phận không vô khuẩn chạm vào {0}"), ZoneLabel);
	I.Ref = GetFName();
	if (const UORActionComponent* A = OtherActor ? OtherActor->FindComponentByClass<UORActionComponent>() : nullptr)
	{
		I.Role = A->Role;
		I.LearnerId = A->LearnerId;
	}
	GS->ServerReportIssue(I);
}

#undef LOCTEXT_NAMESPACE
