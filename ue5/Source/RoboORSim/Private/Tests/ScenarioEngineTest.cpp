// Kiểm thử tự động trong Unreal (Session Frontend > Automation, lọc "RoboOR").
// Cùng các ca với tests/test_engine.py để bảo đảm bản C++ và bản Python cho kết quả giống nhau.
#include "Misc/AutomationTest.h"
#include "ScenarioEngine.h"
#include "ScenarioLoader.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace
{
	FORActionEvent Ev(float T, const TCHAR* Role, const TCHAR* Action, const TCHAR* Target = nullptr, float Dur = -1.f)
	{
		FORActionEvent E;
		E.Time = T;
		E.LearnerId = FString::Printf(TEXT("u-%s"), Role);
		E.Role = FName(Role);
		E.Action = FName(Action);
		E.Target = Target ? FName(Target) : NAME_None;
		E.DurationS = Dur;
		return E;
	}

	bool Load(FAutomationTestBase& Test, const TCHAR* File, FORScenarioDef& Out)
	{
		FString Err;
		const bool bOk = UScenarioLoader::LoadScenarioFile(File, Out, Err);
		Test.TestTrue(FString::Printf(TEXT("Đọc %s: %s"), File, *Err), bOk);
		return bOk;
	}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRoboORM6Expert, "RoboOR.Engine.M6.ExpertPasses",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter)
bool FRoboORM6Expert::RunTest(const FString&)
{
	FORScenarioDef Def;
	if (!Load(*this, TEXT("m6_emergency_undock.json"), Def)) return false;
	FScenarioEngine E(Def);
	E.Handle(Ev(0, TEXT("ptv"), TEXT("announce_emergency")));
	E.Handle(Ev(3, TEXT("anes"), TEXT("acknowledge")));
	E.Handle(Ev(4, TEXT("circ"), TEXT("call_help")));
	E.Handle(Ev(6, TEXT("scrub"), TEXT("open_laparotomy_tray")));
	E.Handle(Ev(8, TEXT("asst"), TEXT("remove_instrument"), TEXT("arm1")));
	E.Handle(Ev(14, TEXT("asst"), TEXT("remove_instrument"), TEXT("arm2")));
	E.Handle(Ev(20, TEXT("asst"), TEXT("remove_instrument"), TEXT("arm3")));
	E.Handle(Ev(26, TEXT("asst"), TEXT("remove_camera")));
	E.Handle(Ev(30, TEXT("ptv"), TEXT("scrub_in")));
	E.Handle(Ev(34, TEXT("asst"), TEXT("undock_arm"), TEXT("arm1")));
	E.Handle(Ev(40, TEXT("scrub"), TEXT("undock_arm"), TEXT("arm2")));
	E.Handle(Ev(46, TEXT("asst"), TEXT("undock_arm"), TEXT("arm3")));
	E.Handle(Ev(52, TEXT("scrub"), TEXT("undock_arm"), TEXT("camera")));
	E.Handle(Ev(60, TEXT("circ"), TEXT("move_cart_away")));
	E.Handle(Ev(75, TEXT("ptv"), TEXT("start_laparotomy")));
	const FORResult R = E.Terminate(75);
	TestTrue(TEXT("Đạt"), R.bPassed);
	TestEqual(TEXT("Điểm 100"), R.Score, 100.f);
	TestEqual(TEXT("Không lỗi"), R.NumIssues, 0);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRoboORM6Danger, "RoboOR.Engine.M6.DangerousActionBlocked",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter)
bool FRoboORM6Danger::RunTest(const FString&)
{
	FORScenarioDef Def;
	if (!Load(*this, TEXT("m6_emergency_undock.json"), Def)) return false;
	FScenarioEngine E(Def);
	const FORFeedback Fb = E.Handle(Ev(0, TEXT("asst"), TEXT("undock_arm"), TEXT("arm1")));
	TestTrue(TEXT("Có lỗi"), Fb.Issue.IsSet());
	TestTrue(TEXT("Lỗi nguy hiểm"), Fb.Issue.IsSet() && Fb.Issue->Severity == EORSeverity::Critical);
	TestTrue(TEXT("Tay vẫn gắn"), E.IsArmDocked(TEXT("arm1")));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRoboORM2Scrub, "RoboOR.Engine.M2.ShortScrubRepeated",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter)
bool FRoboORM2Scrub::RunTest(const FString&)
{
	FORScenarioDef Def;
	if (!Load(*this, TEXT("m2_sterile_basics.json"), Def)) return false;
	FScenarioEngine E(Def);
	TestTrue(TEXT("60 giây bị từ chối"), E.Handle(Ev(0, TEXT("stu"), TEXT("hand_scrub"), nullptr, 60)).Issue.IsSet());
	TestEqual(TEXT("130 giây được chấp nhận"), E.Handle(Ev(70, TEXT("stu"), TEXT("hand_scrub"), nullptr, 130)).StepCompleted, FName(TEXT("hand_scrub")));
	return true;
}

#endif
