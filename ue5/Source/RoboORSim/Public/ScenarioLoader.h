// Đọc scenarios/*.json (cùng định dạng với bản Python) thành FORScenarioDef.
#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "ORTypes.h"
#include "ScenarioLoader.generated.h"

UCLASS()
class ROBOORSIM_API UScenarioLoader : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	/** Đọc từ chuỗi JSON. Trả về false và điền OutError nếu sai cấu trúc. */
	static bool ParseScenario(const FString& Json, FORScenarioDef& OutDef, FString& OutError);

	/** Đọc file trong Content/Scenarios/, ví dụ "m6_emergency_undock.json". */
	UFUNCTION(BlueprintCallable, Category = "RoboOR")
	static bool LoadScenarioFile(const FString& FileName, FORScenarioDef& OutDef, FString& OutError);
};
