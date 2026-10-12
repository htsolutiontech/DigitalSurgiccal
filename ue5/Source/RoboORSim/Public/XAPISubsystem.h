// Gửi câu lệnh xAPI 1.0.3 về LRS. Cấu trúc câu lệnh giống simcore/xapi.py để máy chủ báo cáo dùng chung.
// Cấu hình trong Config/DefaultGame.ini:
//   [/Script/RoboORSim.XAPISubsystem]
//   Endpoint=http://127.0.0.1:8000/xapi/statements
//   Token=
//   BaseIri=https://xapi.example-healthv.vn
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "ORTypes.h"
#include "XAPISubsystem.generated.h"

class FJsonObject;

UCLASS(Config = Game)
class ROBOORSIM_API UXAPISubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	UPROPERTY(Config) FString Endpoint = TEXT("http://127.0.0.1:8000/xapi/statements");
	UPROPERTY(Config) FString Token;
	UPROPERTY(Config) FString BaseIri = TEXT("https://xapi.example-healthv.vn");

	void BeginSession(const FORScenarioDef& Def, const FString& TeamId);
	void SendStepCompleted(const FORActionEvent& Ev, FName StepId, bool bSuccess);
	void SendIssue(const FORIssue& Issue);
	void EndSession(const FORResult& Result);

	/** Mã đăng ký (registration) của buổi hiện tại, dùng để tra cứu trên bảng điều khiển */
	UFUNCTION(BlueprintPure, Category = "RoboOR")
	FString GetRegistration() const { return Registration; }

private:
	TSharedRef<FJsonObject> MakeStatement(const TSharedRef<FJsonObject>& Actor, const FString& VerbKey,
	                                      const TSharedRef<FJsonObject>& Object, float T, FName Role) const;
	TSharedRef<FJsonObject> Agent(const FString& LearnerId) const;
	TSharedRef<FJsonObject> ScenarioActivity() const;
	TSharedRef<FJsonObject> StepActivity(FName StepId) const;
	FString Timestamp(float T) const;
	void Post(TArray<TSharedPtr<FJsonObject>> Statements);
	void FlushPending();

	FORScenarioDef Def;
	FString TeamId;
	FString Registration;
	FDateTime StartUtc;
	TSet<FString> Learners;
	TArray<FString> Pending;   // thân yêu cầu gửi lỗi, gửi lại ở lần sau
};
