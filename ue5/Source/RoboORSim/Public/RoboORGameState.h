// Trạng thái buổi mô phỏng, chạy trên máy chủ và đồng bộ tới mọi học viên trong phòng ảo.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameStateBase.h"
#include "ORTypes.h"
#include "ScenarioEngine.h"
#include "RoboORGameState.generated.h"


DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnORStepsChanged);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnORFeedback, bool, bOk, const FText&, Message, FName, Role);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnORFinished, const FORResult&, Result);

UCLASS()
class ROBOORSIM_API ARoboORGameState : public AGameStateBase
{
	GENERATED_BODY()

public:
	ARoboORGameState();
	virtual ~ARoboORGameState() override;

	/** Bắt đầu kịch bản (chỉ máy chủ). FileName nằm trong Content/Scenarios/. */
	UFUNCTION(BlueprintCallable, BlueprintAuthorityOnly, Category = "RoboOR")
	bool StartScenario(const FString& FileName, const FString& TeamId);

	/** Kết thúc buổi, tính điểm, gửi kết quả xAPI (chỉ máy chủ). */
	UFUNCTION(BlueprintCallable, BlueprintAuthorityOnly, Category = "RoboOR")
	FORResult FinishScenario();

	/** Gọi từ UORActionComponent trên máy chủ. */
	void ServerHandleAction(FORActionEvent Ev);

	/** Gọi từ USterileFieldComponent trên máy chủ. */
	void ServerReportIssue(FORIssue Issue);

	UFUNCTION(BlueprintPure, Category = "RoboOR")
	float GetScenarioTime() const;

	UFUNCTION(BlueprintPure, Category = "RoboOR")
	bool IsArmDocked(FName Arm) const;

	UPROPERTY(ReplicatedUsing = OnRep_Steps, BlueprintReadOnly, Category = "RoboOR")
	TArray<FORStepState> Steps;

	UPROPERTY(ReplicatedUsing = OnRep_Steps, BlueprintReadOnly, Category = "RoboOR")
	TArray<FORIssue> Issues;

	UPROPERTY(Replicated, BlueprintReadOnly, Category = "RoboOR")
	FORScenarioDef ScenarioDef;

	UPROPERTY(Replicated, BlueprintReadOnly, Category = "RoboOR")
	float StartServerTime = -1.f;

	UPROPERTY(BlueprintAssignable, Category = "RoboOR")
	FOnORStepsChanged OnStepsChanged;

	UPROPERTY(BlueprintAssignable, Category = "RoboOR")
	FOnORFeedback OnFeedback;

	UPROPERTY(BlueprintAssignable, Category = "RoboOR")
	FOnORFinished OnFinished;

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

protected:
	UFUNCTION()
	void OnRep_Steps();

	UFUNCTION(NetMulticast, Reliable)
	void MulticastFeedback(bool bOk, const FText& Message, FName Role);

	UFUNCTION(NetMulticast, Reliable)
	void MulticastFinished(const FORResult& Result);

private:
	void SyncFromEngine();
	class UXAPISubsystem* GetXAPI() const;

	TUniquePtr<FScenarioEngine> Engine;
	FString TeamId;
};
