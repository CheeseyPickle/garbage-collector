import {
  canEquip,
  equip,
  Item,
  itemType,
  mallPrice,
  myFury,
  retrieveItem,
  useFamiliar,
  useSkill,
  visitUrl,
  weaponHands,
} from "kolmafia";
import {
  $effect,
  $item,
  $items,
  $location,
  $monster,
  $skill,
  $slot,
  clamp,
  CrystalBall,
  get,
  getBanishedMonsters,
  have,
  maxBy,
  property,
  Requirement,
  tryFindFreeRun,
} from "libram";
import { freeFightFamiliar } from "./familiar";
import { latteActionSourceFinderConstraints, ltbRun, setChoice } from "./lib";
import { garboAdventure, Macro } from "./combat";
import { acquire } from "./acquire";
import { globalOptions } from "./config";

export function expectedGregs(): number[] {
  const baseGregs = 3;
  const timeSpunGregs = have($item`Time-Spinner`)
    ? Math.floor((10 - get("_timeSpinnerMinutesUsed")) / 3)
    : 0;
  const orbGregs = have($item`miniature crystal ball`) ? 1 : 0;

  const macrometeors = have($skill`Meteor Lore`) ? 10 - get("_macrometeoriteUses") : 0;
  const replaceEnemies = have($item`Powerful Glove`)
    ? Math.floor((100 - get("_powerfulGloveBatteryPowerUsed")) / 10)
    : 0;
  let totalMonsterReplacers = macrometeors + replaceEnemies;

  const sabersLeft = have($item`Fourth of May Cosplay Saber`)
    ? clamp(5 - get("_saberForceUses"), 0, 3)
    : 0;

  const gregs = [];

  // these are estimates based on intuition
  const replacesPerGreg = have($skill`Transcendent Olfaction`) ? 7 : 5;
  const firstReplaces = clamp(sabersLeft * 2 + replacesPerGreg, 0, totalMonsterReplacers);

  gregs.push(baseGregs + orbGregs + timeSpunGregs + firstReplaces);
  totalMonsterReplacers -= firstReplaces;
  while (totalMonsterReplacers > 0) {
    gregs.push(baseGregs + orbGregs + clamp(replacesPerGreg, 0, totalMonsterReplacers));
    totalMonsterReplacers -= replacesPerGreg;
  }
  gregs.push(baseGregs + orbGregs);

  return gregs;
}

export function doingExtrovermectin(): boolean {
  return (
    get("beGregariousCharges") > 0 ||
    get("beGregariousFightsLeft") > 0 ||
    (globalOptions.prefs.yachtzeechain && !get("_garboYachtzeeChainCompleted"))
  );
}

export function crateStrategy(): "Sniff" | "Saber" | "Orb" | null {
  if (!doingExtrovermectin()) return null;
  if (
    (have($skill`Transcendent Olfaction`) &&
      (property.getString("olfactedMonster") === "crate" || get("_olfactionsUsed") < 2)) ||
    (have($skill`Long Con`) &&
      (get("longConMonster") === $monster`crate` || get("_longConUsed") < 4))
  ) {
    return "Sniff";
  }
  if (have($item`miniature crystal ball`)) return "Orb";
  if (have($item`Fourth of May Cosplay Saber`) && get("_saberForceUses") < 5) return "Saber";
  return null;
}

export function hasMonsterReplacers(): boolean {
  return (
    (have($skill`Meteor Lore`) && get("_macrometeoriteUses") < 10) ||
    (have($item`Powerful Glove`) && get("_powerfulGloveBatteryPowerUsed") < 90)
  );
}

/**
 * Saberfriends a crate if we are able to do so.
 */
export function saberCrateIfSafe(): void {
  const canSaber = have($item`Fourth of May Cosplay Saber`) && get("_saberForceUses") < 5;
  const isSafeToSaber = get("beGregariousFightsLeft") === 0 || get("_saberForceMonsterCount") > 0;
  if (!canSaber || !isSafeToSaber) return;

  do {
    const run = tryFindFreeRun() ?? ltbRun();

    useFamiliar(run.constraints.familiar?.() ?? freeFightFamiliar({ canChooseMacro: false }));
    run.constraints.preparation?.();
    new Requirement([], {
      forceEquip: $items`Fourth of May Cosplay Saber`,
      preventEquip: $items`Kramco Sausage-o-Matic™`,
    })
      .merge(run.constraints.equipmentRequirements?.() ?? new Requirement([], {}))
      .maximize();
    setChoice(1387, 2);
    garboAdventure(
      $location`Noob Cave`,
      Macro.if_($monster`crate`, Macro.skill($skill`Use the Force`))
        .if_($monster`sausage goblin`, Macro.kill())
        .ifHolidayWanderer(run.macro)
        .abort(),
    );
  } while (
    [
      "Puttin' it on Wax",
      "Wooof! Wooooooof!",
      "Playing Fetch*",
      "Your Dog Found Something Again",
    ].includes(get("lastEncounter"))
  );
}

/**
 * Equip the miniature crystal ball if the current prediction is good for us.
 */
export function equipOrbIfDesired(): void {
  if (
    have($item`miniature crystal ball`) &&
    !(get("_saberForceMonster") === $monster`crate` && get("_saberForceMonsterCount") > 0) &&
    crateStrategy() !== "Sniff" &&
    [undefined, $monster`crate`].includes(CrystalBall.ponder().get($location`Noob Cave`))
  ) {
    equip($slot`familiar`, $item`miniature crystal ball`);
  }
}

/**
 * Pre-olfact/saber crates, for extrovermectin/gregarious reasons.
 */
function initializeCrates(): void {
  do {
    // We use the force while olfacting sometimes, so we'll need to refresh mafia's knowledge of olfaction
    if (property.getString("olfactedMonster") !== "crate") {
      visitUrl(`desc_effect.php?whicheffect=${$effect`On the Trail`.descid}`);
    }
    // if we have olfaction, that's our primary method for ensuring crates
    if (
      (crateStrategy() === "Sniff" &&
        (property.getString("olfactedMonster") !== "crate" ||
          !have($effect`On the Trail`) ||
          property.getString("longConMonster") !== "crate" ||
          get("_longConUsed") <= 0)) ||
      (crateStrategy() === "Orb" &&
        ((get("_gallapagosMonster") !== $monster`crate` &&
          have($skill`Gallapagosian Mating Call`)) ||
          (have($item`latte lovers member's mug`) && !get("_latteCopyUsed"))))
    ) {
      const run = tryFindFreeRun(latteActionSourceFinderConstraints) ?? ltbRun();
      setChoice(1387, 2); // use the force, in case we decide to use that

      // Sniff the crate in as many ways as humanly possible
      const macro = Macro.trySkill($skill`Transcendent Olfaction`)
        .trySkill($skill`Long Con`)
        .trySkill($skill`Offer Latte to Opponent`)
        .externalIf(
          get("_gallapagosMonster") !== $monster`crate` && have($skill`Gallapagosian Mating Call`),
          Macro.trySkill($skill`Gallapagosian Mating Call`),
        )
        .trySkill($skill`Use the Force`)
        .step(run.macro);

      // equip latte and saber for lattesniff and saberfriends, if we want to
      // Crank up ML to make sure the crate survives several rounds; we may have some passive damage
      useFamiliar(run.constraints.familiar?.() ?? freeFightFamiliar({ canChooseMacro: false }));
      run.constraints.preparation?.();
      new Requirement(["100 Monster Level"], {
        forceEquip: $items`latte lovers member's mug, Fourth of May Cosplay Saber`.filter((item) =>
          have(item),
        ),
        preventEquip: $items`carnivorous potted plant`,
      })
        .merge(run.constraints.equipmentRequirements?.() ?? new Requirement([], {}))
        .maximize();
      garboAdventure(
        $location`Noob Cave`,
        Macro.if_($monster`crate`, macro)
          .ifHolidayWanderer(run.macro)
          .abort(),
      );
      visitUrl(`desc_effect.php?whicheffect=${$effect`On the Trail`.descid}`);
    } else if (
      crateStrategy() === "Saber" &&
      (get("_saberForceMonster") !== $monster`crate` || get("_saberForceMonsterCount") === 0) &&
      get("_saberForceUses") < 5
    ) {
      saberCrateIfSafe();
    } else break; // we can break the loop if there's nothing to do
  } while (!["crate", "Using the Force"].includes(get("lastEncounter"))); // loop until we actually hit a crate
}

function initializeDireWarren(): void {
  visitUrl("museum.php?action=icehouse");

  const banishedMonsters = getBanishedMonsters();
  if (banishedMonsters.get($item`ice house`) === $monster`fluffy bunny`) return;

  const options = $items`human musk, tryptophan dart, Daily Affirmation: Be a Mind Master`;
  if (options.some((option) => banishedMonsters.get(option) === $monster`fluffy bunny`)) {
    return;
  }
  if (banishedMonsters.get($skill`Batter Up!`) === $monster`fluffy bunny`) return;

  if (!have($item`miniature crystal ball`)) {
    options.push(...$items`Louder Than Bomb, tennis ball`);
  }
  const canBat = myFury() >= 5 && have($skill`Batter Up!`);
  if (canBat) {
    if (have($skill`Iron Palm Technique`) && !have($effect`Iron Palms`)) {
      useSkill($skill`Iron Palm Technique`);
    }
    const availableClub =
      Item.all().find(
        (i) =>
          have(i) &&
          canEquip(i) &&
          weaponHands(i) === 2 &&
          (itemType(i) === "club" || (have($effect`Iron Palms`) && itemType(i) === "sword")),
      ) ?? $item`amok putter`;
    retrieveItem(availableClub);
    new Requirement(["100 Monster Level"], {
      preventEquip: $items`carnivorous potted plant`,
      forceEquip: [availableClub],
    }).maximize();

    do {
      garboAdventure(
        $location`The Dire Warren`,
        Macro.if_($monster`fluffy bunny`, Macro.skill($skill`Batter Up!`)).embezzler(),
      );
    } while (myFury() >= 5 && banishedMonsters.get($skill`Batter Up!`) !== $monster`fluffy bunny`);
  } else {
    const banish = maxBy(options, mallPrice, true);
    acquire(1, banish, 50000, true);
    do {
      garboAdventure(
        $location`The Dire Warren`,
        Macro.if_($monster`fluffy bunny`, Macro.item(banish)).embezzler(),
      );
    } while (
      "fluffy bunny" !== get("lastEncounter") &&
      !get("banishedMonsters").includes("fluffy bunny")
    );
  }
}

export function initializeExtrovermectinZones(): void {
  if (get("beGregariousFightsLeft") === 0) {
    if (hasMonsterReplacers()) initializeCrates();
    initializeDireWarren();
  }
}
