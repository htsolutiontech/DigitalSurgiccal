// Kiểu dữ liệu kịch bản, ánh xạ 1-1 với scenarios/*.json và simcore/scenario.py
#pragma once

#include "CoreMinimal.h"
#include "ORTypes.generated.h"

UENUM(BlueprintType)
enum class EORSeverity : uint8
{
	Minor,
	Major,
	Critical
};

USTRUCT(BlueprintType)
struct FORStepDef
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) FName Id;
	UPROPERTY(BlueprintReadOnly) FText Title;
	UPROPERTY(BlueprintReadOnly) TArray<FName> Roles;
	UPROPERTY(BlueprintReadOnly) FName Action;
	UPROPERTY(BlueprintReadOnly) TArray<FName> After;
	UPROPERTY(BlueprintReadOnly) bool bCritical = false;
	/** NAME_None nếu bước không gắn với một đối tượng cụ thể */
	UPROPERTY(BlueprintReadOnly) FName Target;
	/** Bước cần làm trên nhiều đối tượng (ví dụ tháo 4 tay robot) */
	UPROPERTY(BlueprintReadOnly) TArray<FName> Targets;
	/** < 0 nghĩa là không yêu cầu thời lượng tối thiểu */
	UPROPERTY(BlueprintReadOnly) float MinDurationS = -1.f;
};

USTRUCT(BlueprintType)
struct FORRuleDef
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) FName Id;
	UPROPERTY(BlueprintReadOnly) FName Action;
	UPROPERTY(BlueprintReadOnly) FName IfState;
	UPROPERTY(BlueprintReadOnly) EORSeverity Severity = EORSeverity::Critical;
	UPROPERTY(BlueprintReadOnly) FText Message;
};

USTRUCT(BlueprintType)
struct FORScoring
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) float CriticalMiss = 25.f;
	UPROPERTY(BlueprintReadOnly) float CriticalError = 20.f;
	UPROPERTY(BlueprintReadOnly) float OutOfOrder = 5.f;
	UPROPERTY(BlueprintReadOnly) float WrongRole = 3.f;
	UPROPERTY(BlueprintReadOnly) float OverTimePer10s = 0.f;
	UPROPERTY(BlueprintReadOnly) float PassThreshold = 70.f;
	UPROPERTY(BlueprintReadOnly) bool bFailOnAnyCriticalError = true;
};

USTRUCT(BlueprintType)
struct FORScenarioDef
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) FString Id;
	UPROPERTY(BlueprintReadOnly) FString Version;
	UPROPERTY(BlueprintReadOnly) int32 Module = 0;
	UPROPERTY(BlueprintReadOnly) FText Title;
	UPROPERTY(BlueprintReadOnly) TArray<FName> Roles;
	UPROPERTY(BlueprintReadOnly) TArray<FORStepDef> Steps;
	UPROPERTY(BlueprintReadOnly) TArray<FORRuleDef> Rules;
	/** < 0 nghĩa là không giới hạn */
	UPROPERTY(BlueprintReadOnly) float TimeLimitS = -1.f;
	UPROPERTY(BlueprintReadOnly) TArray<FName> InitialDockedArms;
	UPROPERTY(BlueprintReadOnly) TArray<FName> InitialInstrumentsIn;
	UPROPERTY(BlueprintReadOnly) bool bInitialCameraIn = false;
	UPROPERTY(BlueprintReadOnly) FORScoring Scoring;
	/** "draft" cho tới khi hội đồng chuyên môn duyệt */
	UPROPERTY(BlueprintReadOnly) FString ApprovalStatus = TEXT("draft");

	const FORStepDef* FindStep(FName StepId) const
	{
		return Steps.FindByPredicate([StepId](const FORStepDef& S) { return S.Id == StepId; });
	}
};

USTRUCT(BlueprintType)
struct FORActionEvent
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite) float Time = 0.f;
	/** Mã học viên ẩn danh, không dùng tên hay email */
	UPROPERTY(BlueprintReadWrite) FString LearnerId;
	UPROPERTY(BlueprintReadWrite) FName Role;
	UPROPERTY(BlueprintReadWrite) FName Action;
	UPROPERTY(BlueprintReadWrite) FName Target;
	UPROPERTY(BlueprintReadWrite) float DurationS = -1.f;
};

USTRUCT(BlueprintType)
struct FORIssue
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) float Time = 0.f;
	/** out_of_order | wrong_role | rule | insufficient_duration | sterile_breach | too_close | unexpected */
	UPROPERTY(BlueprintReadOnly) FName Kind;
	UPROPERTY(BlueprintReadOnly) EORSeverity Severity = EORSeverity::Minor;
	UPROPERTY(BlueprintReadOnly) FText Message;
	UPROPERTY(BlueprintReadOnly) FString LearnerId;
	UPROPERTY(BlueprintReadOnly) FName Role;
	UPROPERTY(BlueprintReadOnly) FName Ref;
};

USTRUCT(BlueprintType)
struct FORStepState
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) FName Id;
	UPROPERTY(BlueprintReadOnly) bool bDone = false;
	UPROPERTY(BlueprintReadOnly) float DoneAt = -1.f;
	UPROPERTY(BlueprintReadOnly) FName DoneByRole;
	/** Số đối tượng đã xong / tổng số, cho bước nhiều đối tượng */
	UPROPERTY(BlueprintReadOnly) int32 Progress = 0;
	UPROPERTY(BlueprintReadOnly) int32 Total = 1;
};

USTRUCT(BlueprintType)
struct FORResult
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) float Score = 0.f;
	UPROPERTY(BlueprintReadOnly) bool bPassed = false;
	UPROPERTY(BlueprintReadOnly) float DurationS = 0.f;
	UPROPERTY(BlueprintReadOnly) TArray<FName> MissedCritical;
	UPROPERTY(BlueprintReadOnly) int32 NumCriticalErrors = 0;
	UPROPERTY(BlueprintReadOnly) int32 NumIssues = 0;
};
