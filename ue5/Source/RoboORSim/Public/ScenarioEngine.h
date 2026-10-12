// Bản C++ của simcore/engine.py. Logic phải giữ giống hệt bản Python;
// tests/ (Python) và Private/Tests/ScenarioEngineTest.cpp dùng cùng các ca kiểm thử.
#pragma once

#include "CoreMinimal.h"
#include "ORTypes.h"

struct FORFeedback
{
	bool bOk = true;
	FText Message;
	FName StepCompleted = NAME_None;
	TOptional<FORIssue> Issue;
};

class ROBOORSIM_API FScenarioEngine
{
public:
	explicit FScenarioEngine(const FORScenarioDef& InDef);

	/** Xử lý một hành động của học viên. Chỉ gọi trên máy chủ (authority). */
	FORFeedback Handle(const FORActionEvent& Ev);

	/** Ghi lỗi phát sinh ngoài kịch bản bước, ví dụ vi phạm vô khuẩn do va chạm vật lý. */
	void AddIssue(const FORIssue& Issue);

	/** Kết thúc buổi và tính điểm. */
	FORResult Terminate(float AtTime);

	bool IsFinished() const { return bFinished; }
	bool IsStepDone(FName StepId) const { return Done.Contains(StepId); }
	bool IsArmDocked(FName Arm) const { return Docked.Contains(Arm); }
	const TArray<FORIssue>& GetIssues() const { return Issues; }
	TArray<FORStepState> GetStepStates() const;
	const FORScenarioDef& GetDef() const { return Def; }

private:
	struct FDoneInfo { float Time; FString LearnerId; FName Role; };

	bool StateTrue(FName State, FName Target) const;
	void ApplyEffect(const FORActionEvent& Ev);
	const FORStepDef* MatchStep(const FORActionEvent& Ev) const;
	FORIssue MakeIssue(const FORActionEvent& Ev, FName Kind, EORSeverity Sev, const FText& Msg, FName Ref);

	FORScenarioDef Def;
	TMap<FName, FDoneInfo> Done;
	TMap<FName, TSet<FName>> Partial;
	TArray<FORIssue> Issues;
	TSet<FName> Docked;
	TSet<FName> InstrumentsIn;
	bool bCameraIn = false;
	bool bCartAtTable = false;
	bool bFinished = false;
	float LastTime = 0.f;
};
