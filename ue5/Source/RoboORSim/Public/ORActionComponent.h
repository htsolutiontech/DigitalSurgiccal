// Gắn vào Pawn của học viên. Mọi thao tác (tay cầm VR, cử chỉ, giọng nói) đều quy về SubmitAction.
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "ORActionComponent.generated.h"

UCLASS(ClassGroup = (RoboOR), meta = (BlueprintSpawnableComponent))
class ROBOORSIM_API UORActionComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UORActionComponent();

	/** Vai trò trong ca: ptv, asst, scrub, anes, anesN, circ, stu */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Replicated, Category = "RoboOR")
	FName Role;

	/** Mã học viên ẩn danh do hệ thống quản lý học tập cấp */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Replicated, Category = "RoboOR")
	FString LearnerId;

	/** Gọi từ Blueprint khi học viên thực hiện một hành động, ví dụ ("undock_arm", "arm1"). */
	UFUNCTION(BlueprintCallable, Category = "RoboOR")
	void SubmitAction(FName Action, FName Target, float DurationS = -1.f);

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

protected:
	UFUNCTION(Server, Reliable)
	void ServerSubmitAction(FName Action, FName Target, float DurationS);
};
