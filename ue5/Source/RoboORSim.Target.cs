using UnrealBuildTool;

public class RoboORSimTarget : TargetRules
{
	public RoboORSimTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("RoboORSim");
	}
}
