using UnrealBuildTool;

public class RoboORSimEditorTarget : TargetRules
{
	public RoboORSimEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("RoboORSim");
	}
}
