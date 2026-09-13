import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_SPEND,
  MIN_SPEND,
  addonFreeThenPaid,
  afterPriceDependsOnLines,
  computeSaving,
  declaresRiseInText,
  familyPriceOnly,
  routerPricedSeparately,
  isComparable,
  parseSpend,
  priceUnknownAtLines,
  perLinePrice,
} from "../src/app/lp/catalog/savings.ts";
import { basePackages } from "../src/app/lp/catalog/catalog.ts";

/*
 * ⚠️ הבדיקות רצות מול **הקטלוג האמיתי** (`packages.json`) ולא מול נתוני
 * בדיקה. הכותרת של המחשבון היא הבטחה מספרית לגולש, והסכנה אינה שהקוד
 * ישתנה אלא שהקטלוג יתרענן ויכניס חבילה שמפילה את ההבטחה בשקט. לכן
 * המשמעות של כישלון כאן היא "החידוש האחרון של הקטלוג הכניס חבילה
 * שאסור להשוות מולה" — לא בהכרח "מישהו שבר את הקוד".
 */

const PACKAGES = basePackages();
const pool = (track) => PACKAGES.filter((p) => isComparable(p, track));

test("קלט: תווי זבל פוסלים את הסכום ולא מסוננים ממנו", () => {
  assert.equal(parseSpend("abc220"), 0);
  assert.equal(parseSpend("-500"), 0);
  assert.equal(parseSpend(""), 0);
  assert.equal(parseSpend("0"), 0);
});

test("קלט: שתי נקודות עשרוניות אינן מספר — `1.2.3` לא הופך ל-1.23", () => {
  assert.equal(parseSpend("1.2.3"), 0);
  assert.equal(parseSpend("220.5"), 220.5);
});

test("קלט: מפרידי אלפים, ספרות ערביות וקיטום לתקרה", () => {
  assert.equal(parseSpend("1,200"), 1200);
  assert.equal(parseSpend("٢٢٠"), 220);
  // המקלדת הערבית מפיקה גם את המפרידים שלה, לא רק את הספרות.
  assert.equal(parseSpend("٢٢٠٫٥"), 220.5);
  assert.equal(parseSpend("١٬٢٠٠"), 1200);
  assert.equal(parseSpend("9000"), MAX_SPEND);
});

test("קלט: פסיק שאינו מפריד אלפים פוסל — `220,5` לא הופך ל-2205", () => {
  // ⚠️ הרגל אירופאי לכתוב 220.5. הסינון השקט הפך אותו ל-2,205 ₪ בחודש
  // והציג כותרת של ₪26,100 בשנה על סכום שהלקוח מעולם לא הזין.
  assert.equal(parseSpend("220,5"), 0);
  assert.equal(parseSpend("2,20"), 0);
  assert.equal(parseSpend("1,2,3"), 0);
  assert.equal(parseSpend("1,,200"), 0);
  // מפרידי אלפים אמיתיים ממשיכים לעבוד, גם עם ₪ ורווחים.
  assert.equal(parseSpend("5,000"), MAX_SPEND);
  assert.equal(parseSpend("₪1,200"), 1200);
});

test("קלט: נקודה כמפריד אלפים פוסלת — `1.200` לא הופך ל-1.2", () => {
  // ⚠️ הכיוון ההפוך של `220,5`. השומר הקודם נכתב לפסיק בלבד, ולכן נקודה
  // בודדת חמקה: המסך הצהיר "אתם משלמים ₪1.2 בחודש" והנציג קיבל את אותו
  // מספר בהערה. לחשבון חודשי אין שלוש ספרות אחרי הנקודה.
  assert.equal(parseSpend("1.200"), 0);
  assert.equal(parseSpend("2.200"), 0);
  // עשרוני אמיתי (עד שתי ספרות) ממשיך לעבוד.
  assert.equal(parseSpend("220.50"), 220.5);
  assert.equal(parseSpend("1,200.50"), 1200.5);
});

test("קלט: רווח באמצע המספר פוסל — `2 20` לא הופך ל-220", () => {
  assert.equal(parseSpend("2 20"), 0);
  assert.equal(parseSpend("1 200"), 0);
  // רווח בקצוות, ו-₪ משני הצדדים, הם כתיב לגיטימי.
  assert.equal(parseSpend("  220  "), 220);
  assert.equal(parseSpend("₪ 1,200"), 1200);
  assert.equal(parseSpend("1,200 ₪"), 1200);
});

test("קלט: סכום מתחת לרצפה אינו חשבון חודשי", () => {
  // ⚠️ `0.5` הפיק מסך תוצאה מלא והערה לנציג. החבילה הזולה בקטלוג היא
  // 19.9 ₪, ולכן חשבון חד-ספרתי הוא קלט שגוי ולא חשבון נמוך.
  assert.equal(parseSpend("0.5"), 0);
  assert.equal(parseSpend("5"), 0);
  assert.equal(parseSpend(String(MIN_SPEND)), MIN_SPEND);
});

test("בריכת ההשוואה אינה ריקה בשני המסלולים", () => {
  assert.ok(pool("cellular").length > 5, `סלולר: ${pool("cellular").length}`);
  assert.ok(pool("home").length > 3, `בית: ${pool("home").length}`);
});

test("כל חבילה בת-השוואה יודעת מה תעלה אחרי ההטבה", () => {
  for (const track of ["cellular", "home"]) {
    for (const p of pool(track)) {
      if (p.priceAfterPromo != null) continue;
      assert.equal(
        p.priceAfterPromoNote,
        null,
        `${p.name}: עלייה בהערה חופשית בלי מספר`,
      );
      assert.equal(
        declaresRiseInText(p),
        false,
        `${p.name}: התיאור מצהיר על עלייה שאין לה מספר`,
      );
    }
  }
});

test("סלולר: לא כשר, לא DATA ONLY — קו שאפשר באמת לעבור אליו", () => {
  for (const p of pool("cellular")) {
    assert.equal(p.spec.kosher, false, `${p.name}: חבילה כשרה`);
    assert.ok((p.spec.minutes ?? 0) >= 1000, `${p.name}: ${p.spec.minutes} דקות`);
    assert.ok(p.price > 0, `${p.name}: מחיר ${p.price}`);
  }
});

test("בית: אינטרנט **וגם** טלוויזיה, ולא שירות סטרימינג", () => {
  for (const p of pool("home")) {
    assert.ok(p.spec.hasInternet, `${p.name}: בלי אינטרנט`);
    assert.ok(p.spec.hasTv, `${p.name}: בלי טלוויזיה`);
    assert.notEqual(p.type, "TV", `${p.name}: חבילת טלוויזיה בלבד`);
  }
});

test("חבילות שקוברות את העלייה בתיאור נשארות בחוץ", () => {
  const excluded = (name) => {
    const p = PACKAGES.find((x) => x.name.includes(name));
    assert.ok(p, `לא נמצאה בקטלוג: ${name}`);
    assert.equal(isComparable(p, p.category), false, `${p.name} נכנסה לבריכה`);
  };
  // 39.9 ₪, שני שדות המחיר ריקים, ובתיאור "מהחודש ה-13 והלאה- 59.9 ₪".
  excluded("Partner Golden 5G");
  // שירות סטרימינג שסומן בטעות `hasInternet` — הזול ביותר בקטגוריה.
  excluded("החבילה המושלמת 79 שח");
});

test("מחיר שמותנה בכמות קווים אינו נכנס לבריכת ההשוואה", () => {
  const excluded = (name) => {
    const p = PACKAGES.find((x) => x.name.includes(name));
    assert.ok(p, `לא נמצאה בקטלוג: ${name}`);
    assert.equal(isComparable(p, p.category), false, `${p.name} נכנסה לבריכה`);
  };
  // 32 ₪ — המחיר "לכל קו שני" בחבילה של ארבעה, לא מחיר של קו בודד.
  // אין לה `description` כלל, ולכן השם הוא הראיה היחידה.
  excluded("4 ב 130 *2*");
  // "*לרוכשים 2 מנויים ויותר*" — מינימום חוזי של שני קווים.
  excluded("TOTAL 5G 300GB");
  // מחיר של חבילה שלמה שיושב בשדה מחיר-לקו.
  excluded("3 קווים ב 92.70");

  // ⚠️ ההגנה לא נגסה במנצחת: הבריכה עדיין מחזירה מחיר אמיתי בשני
  // המסלולים, ולא רק "לא נמצאה חבילה".
  for (const track of ["cellular", "home"]) {
    assert.ok(computeSaving(PACKAGES, track, 1, 500).pick, `${track}: הבריכה התרוקנה`);
  }
});

test("מחיר משפחתי אינו מחיר של קו בודד", () => {
  const family = PACKAGES.find((x) => x.name === "wecomFamily 4G");
  const single = PACKAGES.find((x) => x.name === "wecomFree 4G");
  assert.ok(family && single, "חבילות WeCom לא נמצאו בקטלוג");
  assert.ok(familyPriceOnly(family));
  assert.equal(familyPriceOnly(single), false);

  // קו אחד: 29.9 הוא מחיר למנוי במסלול משפחתי, ולכן לא מוצע למי שקונה קו יחיד.
  const one = computeSaving(PACKAGES, "cellular", 1, 500);
  assert.ok(one.pick, "הבריכה התרוקנה לקו אחד");
  assert.notEqual(one.pick.name, "wecomFamily 4G");
  // הנבחרת לקו אחד לא תומחרה לפי המחיר המשפחתי (29.9). wecom300GB 5G
  // ב-34 ₪ מנצחת בצדק — היא מחיר למנוי בודד.
  assert.ok(perLinePrice(one.pick, 1) > family.price, `קו בודד תומחר לפי המחיר המשפחתי ${family.price}`);

  // שני קווים ומעלה: המחיר המשפחתי הוא בדיוק מה שיגבו.
  const two = computeSaving(PACKAGES, "cellular", 2, 500);
  assert.equal(two.pick?.name, "wecomFamily 4G");
});

test("תוקף מוגבל בניסוח חופשי נחשב לעלייה במחיר", () => {
  const fake = (description) => ({ name: "x", description, benefits: null });
  for (const text of ["מחיר תקף ל 24 חודשים", "מחיר קבוע ל24 חודשים", "למשך שנתיים", "למשך 5 שנים"]) {
    assert.ok(declaresRiseInText(fake(text)), `לא זוהה: ${text}`);
  }
  assert.equal(declaresRiseInText(fake("גלישה חופשית ללא הגבלה")), false);
});

test("צורות נוספות של עלייה בטקסט חופשי נתפסות", () => {
  // ⚠️ סריקת הקטלוג מ-12.9.2026: כל אחת מהן הופיעה בחבילה אמיתית
  // וחמקה מהרגקס. ראה ההערה על `RISE_IN_TEXT`.
  const fake = (description) => ({ name: "x", description, benefits: null });
  for (const text of [
    "12 ערוצי דרמות חינם אח\"כ 49.9",
    "חודשיים ראשונים 24.90",
    "לחודשיים ראשונים ב-39",
    "חודש ראשון חינם",
    "מחיר לשנה ואז 179 שח",
    "לאחר שנה 159 ₪ לחודש",
    "שנה שניה שלישית 229",
  ]) {
    assert.ok(declaresRiseInText(fake(text)), `לא זוהה: ${text}`);
  }
});

test("מחיר-אחרי-הטבה אחד לחבילה שמתמחרת לפי כמות מנויים אינו בר-השוואה", () => {
  // סלקום "משפחתי פלוס": priceAfterPromo 59.9, ובטקסט "לאחר שנה … עד 2
  // מנויים כולל – 64.90 ₪ למנוי". המספר היחיד שנמסר אינו המחיר לקו אחד.
  const p = PACKAGES.find((x) => x.name.includes("סלקום משפחתי פלוס"));
  assert.ok(p, "לא נמצאה בקטלוג: סלקום משפחתי פלוס");
  assert.ok(afterPriceDependsOnLines(p));
  assert.equal(isComparable(p, "cellular"), false);
  // בלי מחיר-אחרי-הטבה המדרגות עצמן הן המידע, והכלל לא חל.
  const pro = PACKAGES.find((x) => x.name.includes("סלקום 5G PRO"));
  assert.ok(pro, "לא נמצאה בקטלוג: סלקום 5G PRO");
  assert.equal(afterPriceDependsOnLines(pro), false);
});

test("בית: נתב שמתומחר מחוץ למחיר פוסל את החבילה", () => {
  const fake = (description) => ({ name: "x", description, benefits: null });
  // yes: "עלות נתב אינטרנט 20שח (יש הטבה על הנתב למשך שנה ללא עלות)".
  const yes = PACKAGES.filter((x) => x.name.startsWith("יס + אולטימייט"));
  assert.ok(yes.length >= 1, "לא נמצאו בקטלוג חבילות יס + אולטימייט");
  for (const p of yes) {
    assert.ok(routerPricedSeparately(p), `${p.name}: הנתב הנפרד לא זוהה`);
    assert.equal(isComparable(p, "home"), false, `${p.name} נכנסה לבריכה`);
  }
  assert.ok(routerPricedSeparately(fake("נתב פייבר בהשכרה בתוספת 25 ₪ לחודש")));
  // נתב חינם או כלול אינו חיוב נסתר.
  assert.equal(routerPricedSeparately(fake("עלות נתב 0 ש\"ח")), false);
  assert.equal(routerPricedSeparately(fake("נתב כלול במחיר")), false);
  assert.equal(routerPricedSeparately(fake("139 ₪ + 34.9 ₪ נתב סטאר = 173.9 ₪")), false);
});

test("תוספת שניתנת חינם ואחר כך מחויבת פוסלת את החבילה", () => {
  const fake = (description) => ({ name: "x", description, benefits: null });
  // HOT "סיב 1000/100 כולל NEXT TV": 119 → 135, ובטקסט "12 ערוצי דרמות
  // חינם אח"כ 49.9" ו-"2חודשים HBO אח"כ 25שח". הייתה הבחירה של מסלול הבית.
  const hot = PACKAGES.find((p) => p.name === "סיב 1000/100 כולל NEXT TV");
  assert.ok(hot, "החבילה נעלמה מהקטלוג");
  assert.ok(addonFreeThenPaid(hot), "התוספת שהופכת לבתשלום לא זוהתה");
  assert.equal(isComparable(hot, "home"), false, "נכנסה לבריכה למרות תוספת בתשלום");
  assert.ok(addonFreeThenPaid(fake("ערוצי ספורט ללא עלות ואח״כ 29.9")));
  // עליית המחיר עצמו אינה תוספת — לזה יש priceAfterPromo.
  assert.equal(addonFreeThenPaid(fake("חודשיים ב-59 ש\"ח אח\"כ 119 ש\"ח")), false);
  assert.equal(addonFreeThenPaid(fake("נתב כלול במחיר")), false);
  // הבחירה של הבית לא נשענת יותר עליה.
  const pick = computeSaving(PACKAGES, "home", 1, 250).pick;
  assert.notEqual(pick?.name, "סיב 1000/100 כולל NEXT TV");
});

test("מדרגת קווים שמייקרת נלקחת כפי שהיא, בלי Math.min", () => {
  const golan = PACKAGES.find((p) => p.name.includes("קיץ חם בדור 5"));
  assert.ok(golan, "החבילה נעלמה מהקטלוג");
  // המדרגה: 2 קווים ב-44.90 ₪ לקו, 3 קווים ב-39.90. המחיר המוצג הוא 39.90.
  assert.equal(perLinePrice(golan, 2), 44.9);
  assert.equal(perLinePrice(golan, 3), 39.9);
});

test("כמות שמתחת לטבלת המדרגות אינה מתומחרת לפי מחיר הבסיס", () => {
  // ⚠️ הבדיקה הזו **קיבעה קודם את הבאג**: היא תיעדה `perLinePrice(golan, 1)
  // === 39.9` כהתנהגות רצויה ("פחות מהמדרגה הנמוכה ביותר — המחיר המוצג").
  // 39.9 הוא מחיר **שלושה** קווים: התיאור מפרט "קו בודד – 49.90 ₪", כלומר
  // מי שביקש קו אחד קיבל כותרת מנופחת ב-₪120 בשנה.
  const golan = PACKAGES.find((p) => p.name.includes("קיץ חם בדור 5"));
  assert.ok(golan, "החבילה נעלמה מהקטלוג");
  assert.equal(priceUnknownAtLines(golan, 1), true);
  assert.equal(priceUnknownAtLines(golan, 2), false);
  assert.equal(priceUnknownAtLines(golan, 3), false);
  assert.ok(
    !computeSaving(PACKAGES, "cellular", 1, 500).pick?.name.includes("קיץ חם בדור 5"),
    "חבילה בלי מחיר ידוע לקו בודד נבחרה בכל זאת",
  );

  // בסיס **גבוה** מהמדרגה הנמוכה ביותר הוא טבלת הנחת-כמות עקבית, ונשאר.
  const partner = PACKAGES.find((p) => p.name.includes("Partner Star"));
  assert.ok(partner, "החבילה נעלמה מהקטלוג");
  assert.equal(priceUnknownAtLines(partner, 1), false);
  assert.equal(perLinePrice(partner, 1), 39.9);

  // ⚠️ ההגנה לא ריקנה את הבריכה באף כמות קווים.
  for (const units of [1, 2, 3, 5, 10]) {
    assert.ok(computeSaving(PACKAGES, "cellular", units, 500).pick, `${units} קווים: הבריכה התרוקנה`);
  }
});

test("חבילה עם מחיר-אחרי-הטבה מדווח מתומחרת לפיו בכל כמות קווים", () => {
  const cellcom = PACKAGES.find((p) => p.name.includes("סלקום משפחתי פלוס"));
  assert.ok(cellcom, "החבילה נעלמה מהקטלוג");
  assert.equal(cellcom.priceAfterPromo, 59.9);
  // המדרגות מתומחרות מול 39.9 שהוא מחיר ההטבה; 59.9 הוא המספר השמרני.
  for (const lines of [1, 2, 3, 10]) assert.equal(perLinePrice(cellcom, lines), 59.9);
});

test("השנתי הוא בדיוק החודשי כפול 12, בכל מספר קווים", () => {
  for (const units of [1, 2, 3, 5, 10]) {
    const s = computeSaving(PACKAGES, "cellular", units, 220);
    assert.equal(s.yearly, s.monthly * 12);
    assert.equal(Number.isInteger(s.monthly), true);
  }
});

test("סלולר מתומחר לקו, בית הוא חשבון אחד", () => {
  const one = computeSaving(PACKAGES, "cellular", 1, 220);
  const three = computeSaving(PACKAGES, "cellular", 3, 220);
  assert.ok(three.monthly < one.monthly, "שלושה קווים אמורים לעלות יותר מקו אחד");

  const home1 = computeSaving(PACKAGES, "home", 1, 220);
  const home5 = computeSaving(PACKAGES, "home", 5, 220);
  assert.equal(home5.monthly, home1.monthly);
});

test("חשבון נמוך אינו מייצר חיסכון", () => {
  const s = computeSaving(PACKAGES, "cellular", 1, 20);
  assert.equal(s.worthwhile, false);
  assert.ok(s.pick, "עדיין נבחרה חבילה — הכישלון הוא בחיסכון ולא בהשוואה");
});

test("החיסכון שמוצג בפועל נשען על מחיר שנמצא בקטלוג", () => {
  for (const track of ["cellular", "home"]) {
    const s = computeSaving(PACKAGES, track, 3, 220);
    assert.ok(s.pick, `${track}: לא נבחרה חבילה`);
    const perLine = perLinePrice(s.pick, 3);
    const expected = track === "cellular" ? perLine * 3 : perLine;
    assert.equal(s.monthly, Math.round(220 - expected));
    // המחיר חייב להיות אחד משני השדות של החבילה, לא מספר מסונתז.
    assert.ok(
      perLine === s.pick.priceAfterPromo ||
        perLine === s.pick.price ||
        (s.pick.spec.lineTiers ?? []).some((t) => t.price === perLine),
      `${s.pick.name}: ${perLine} אינו מחיר שמופיע בחבילה`,
    );
  }
});
