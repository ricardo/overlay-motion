import type { TemplateDef } from "../types";
import { createListStepsComponent, listStepsSchema } from "../checklist-steps";

const BulletSteps = createListStepsComponent("bullet");

export const bulletStepsDef: TemplateDef = {
  slug: "bullet-steps",
  title: "Bullet Steps",
  tier: "free",
  category: "Text",
  description:
    "List items land one by one with simple round bullets. Add word-level timestamps to sync each item with the speaker.",
  sourceContract: "overlay",
  regions: ["center", "fullscreen", "right-panel"],
  schema: listStepsSchema,
  demoProps: {
    title: "Everything included",
    steps: [
      "Vertical clips",
      "Brand-ready captions",
      "Automated charts",
      "Consistent endings",
    ],
  },
  demoDurationSec: 6,
  component: BulletSteps,
};
