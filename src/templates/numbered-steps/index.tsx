import type { TemplateDef } from "../types";
import { createListStepsComponent, listStepsSchema } from "../checklist-steps";

const NumberedSteps = createListStepsComponent("number");

export const numberedStepsDef: TemplateDef = {
  slug: "numbered-steps",
  title: "Numbered Steps",
  tier: "free",
  category: "Text",
  description:
    "Steps land one by one with clear numbered markers. Add word-level timestamps to sync each item with the speaker.",
  sourceContract: "overlay",
  regions: ["center", "fullscreen", "right-panel"],
  schema: listStepsSchema,
  demoProps: {
    title: "Launch in three steps",
    steps: [
      "Cut the demo into vertical clips",
      "Add captions in the brand pill",
      "Publish every version",
    ],
  },
  demoDurationSec: 6,
  component: NumberedSteps,
};
