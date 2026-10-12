using UnrealBuildTool;

public class RoboORSim : ModuleRules
{
	public RoboORSim(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core", "CoreUObject", "Engine", "InputCore",
			"HTTP", "Json", "JsonUtilities", "NetCore"
		});
	}
}
