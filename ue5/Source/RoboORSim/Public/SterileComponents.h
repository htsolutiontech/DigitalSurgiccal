// Vùng vô khuẩn và trạng thái vô khuẩn của bàn tay, dựa trên va chạm vật lý của Unreal.
// Tương ứng simcore/sterile.py. Cần đặt Collision Profile cho phép Overlap giữa hai loại component.
#pragma once

#include "CoreMinimal.h"
#include "Components/BoxComponent.h"
#include "Components/SphereComponent.h"
#include "SterileComponents.generated.h"

/** Gắn vào xương bàn tay (MetaHuman: hand_l, hand_r) của nhân vật học viên. */
UCLASS(ClassGroup = (RoboOR), meta = (BlueprintSpawnableComponent))
class ROBOORSIM_API UHandSterilityComponent : public USphereComponent
{
	GENERATED_BODY()

public:
	UHandSterilityComponent();

	/** true sau khi học viên mặc áo và mang găng vô khuẩn đúng quy trình */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Replicated, Category = "RoboOR")
	bool bSterile = false;

	UFUNCTION(BlueprintCallable, Category = "RoboOR")
	void SetSterile(bool bNew) { bSterile = bNew; }

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
};

/** Đặt lên mặt khăn mổ, bàn dụng cụ, bàn Mayo. */
UCLASS(ClassGroup = (RoboOR), meta = (BlueprintSpawnableComponent))
class ROBOORSIM_API USterileFieldComponent : public UBoxComponent
{
	GENERATED_BODY()

public:
	USterileFieldComponent();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "RoboOR")
	FText ZoneLabel;

	/** Không báo lặp lại cùng một bàn tay trong khoảng này (giây) */
	UPROPERTY(EditAnywhere, Category = "RoboOR")
	float CooldownS = 3.f;

protected:
	virtual void BeginPlay() override;

	UFUNCTION()
	void HandleOverlap(UPrimitiveComponent* OverlappedComp, AActor* OtherActor, UPrimitiveComponent* OtherComp,
	                   int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult);

private:
	TMap<TWeakObjectPtr<UPrimitiveComponent>, float> LastReport;
};
