"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "./Card";
import { LeadForm } from "./LeadForm";
import { shekels } from "../catalog/format";
import { catalog } from "../catalog/catalog";
import { crmCategory } from "../config";
import { fieldClass } from "./field";
import { MAX_SPEND, MIN_SPEND, computeSaving, parseSpend, perLinePrice, type Track } from "../catalog/savings";
import type { Package } from "../catalog/types";

/**
 * ⚠️ החישוב עצמו חי ב-`../catalog/savings` ולא כאן: הוא נבדק ב-
 * `tools/savings.test.mjs` מול הקטלוג המלא. הקומפוננטה הזו אחראית
 * למסך בלבד.
 */

/** "3 קווים" אבל "קו אחד" — הנציג קורא את זה, ו-"1 קווים" נראה כמו תקלה. */
function unitsLabel(track: Track, units: number): string {
  if (track === "home") return "אינטרנט וטלוויזיה";
  return units === 1 ? "קו אחד" : `${units} קווים`;
}

/** התאריך שבו נשאב הקטלוג — המספר שנשען עליו לא יכול להיות חסר חותמת. */
/*
 * ⚠️ `timeZone` מפורש. הקומפוננטה היא `"use client"`, כלומר השורה הזו
 * רצה גם ב-SSR וגם בדפדפן — ובלי אזור זמן קבוע כל צד מפרש את
 * `2026-08-14T08:29:53.259Z` לפי האזור שלו. גולש ב-UTC-10 היה מקבל
 * "13 באוגוסט" מהדפדפן מול "14 באוגוסט" מהשרת, כלומר hydration
 * mismatch בדיוק בהסתייגות שנועדה לתת למספר חותמת אמינה.
 */
const CATALOG_DATE = new Date(catalog.updatedAt).toLocaleDateString("he-IL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jerusalem",
});

/**
 * "What do you pay today?" — the reverse of a filter grid, and the highest
 * converting pattern on the competing sites. Two differences here:
 *
 *  1. The result is computed against the real catalogue, never a made-up
 *     percentage — but the headline is the SAVING, not the package behind it.
 *     Naming the package turns the answer into a price list; "how much you
 *     keep" is what the visitor came for, and the package itself is the sales
 *     conversation the lead is supposed to start.
 *  2. The saving is shown BEFORE the phone number is requested. Asking for a
 *     phone to reveal a figure we already know is what makes these calculators
 *     feel like a trap.
 */
export function SavingsCalculator({ packages }: { packages: Package[] }) {
  const [step, setStep] = useState(0);
  const [track, setTrack] = useState<Track>("cellular");
  const [spend, setSpend] = useState("");
  const [units, setUnits] = useState(1);

  /*
   * ⚠️ מעבר שלב השאיר את הפוקוס על `&lt;body&gt;`. הכרטיס מחליף את כל תוכנו
   * בלי לנווט, ולכן קורא-מסך שלחץ "חשבו לי את החיסכון" איבד את מקומו
   * וקפץ לראש המסמך — ההכרזה "שלב 2 מתוך 3" נשמעה, אבל לא היה לאן
   * להמשיך ממנה. הפוקוס עובר לכותרת השלב החדש.
   *
   * הפוקוס עובר רק כשהשלב **השתנה**, ולא בטעינה: הדף לא אמור לקפוץ
   * אל המחשבון רק מפני שהוא קיים. ⚠️ ההשוואה היא מול השלב הקודם ולא
   * דגל "כבר התחלנו" — ב-StrictMode האפקט רץ פעמיים במאונט, הדגל שרד
   * בין הריצות, והריצה השנייה גנבה את הפוקוס בכל כניסה לדף ב-dev.
   */
  const headingRef = useRef<HTMLHeadingElement>(null);
  const prevStep = useRef(step);
  useEffect(() => {
    if (prevStep.current !== step) headingRef.current?.focus();
    prevStep.current = step;
  }, [step]);

  const monthlySpend = parseSpend(spend);
  /*
   * ⚠️ נדלק רק אחרי לחיצה על ה-CTA. שדה ריק בכניסה לשלב אינו שגיאה,
   * אבל לחיצה על "חשבו לי את החיסכון" בשדה ריק **הייתה** לא עושה כלום
   * ובלי מילה אחת של הסבר — הכפתור נראה שבור.
   */
  const [attempted, setAttempted] = useState(false);

  const saving = useMemo(
    () => computeSaving(packages, track, units, monthlySpend),
    [packages, track, units, monthlySpend],
  );
  const { monthly: monthlySaving, yearly: yearlySaving, worthwhile } = saving;
  /*
   * ⚠️ "לא נמצאה חבילה" אינו "לא נמצא חיסכון". הפילטרים ב-`isComparable`
   * יכולים לרוקן קטגוריה שלמה (למשל אם כל חבילות הבית יצהירו על עלייה
   * בטקסט חופשי), ואז המסך אמר למי שמשלם ₪400 "אתם כבר משלמים מעט
   * יחסית" — והנציג קיבל הערה שהמחשבון בדק ולא מצא. שתי האמירות שקריות.
   */
  const noMatch = saving.pick == null;

  /** מעבר לתוצאה — משותף ל-CTA ול-Enter בשדה, כדי ששניהם יתנהגו זהה. */
  function submitSpend() {
    setAttempted(true);
    if (monthlySpend <= 0) return;
    setStep(2);
  }

  /*
   * ⚠️ הסיבות שהכפתור מושבת חייבות להיאמר. כפתור `disabled` יוצא
   * מסדר המקלדת ונעלם בלי הסבר, והקיטום ל-MAX_SPEND מחליף בשקט את מה
   * שהמשתמש הקליד — מי שמשלם ₪6,000 חשב שהמקלדת נתקעה.
   *
   * ⚠️ הנוסח מדבר גם על `0` ועל `-500`: שניהם מספרים, וההודעה הישנה
   * ("במספרים בלבד") שלחה את מי שהקליד אותם לחפש תו נסתר.
   */
  /*
   * ⚠️ נדלק אחרי `blur` או אחרי לחיצה על ה-CTA — לא בכל הקשה.
   *
   * הבדיקה הרצה על כל תו הכריזה שגיאה על מצבי הביניים של קלט **תקין**:
   * מי שהקליד `1,200` עבר דרך `1,` `1,2` `1,20`, שכולם נפסלים, והפסקה
   * (`aria-live="polite"`) הקריאה לקורא מסך "הזינו סכום חודשי…" שלוש
   * פעמים בזמן שהוא מקליד סכום לגיטימי לחלוטין.
   */
  const [blurred, setBlurred] = useState(false);
  // ⚠️ אחרי לחיצה על ה-CTA גם שדה **ריק** הוא שגיאה — זה בדיוק המקרה
  // ש-`attempted` נועד לו, והתנאי `spend.trim() !== ""` היה מבטל אותו:
  // לחיצה בשדה ריק חזרה בשקט בלי שההסבר יידלק. `blurred` לבדו עדיין
  // לא מתלונן על שדה ריק — יציאה מהשדה בלי להקליד אינה טעות.
  const invalidSpend = monthlySpend <= 0 && (attempted || (blurred && spend.trim() !== ""));
  const spendHint = invalidSpend
    ? // ⚠️ הנוסח הקודם ("ספרות בלבד") היה שגוי עובדתית: פסיק, רווח
      // ו-₪ מתקבלים היטב, ולכן מי שהקליד `2,20` וקרא "ספרות בלבד"
      // מחק את הפסיק במקום לתקן את מיקומו. ההודעה מתארת עכשיו את
      // הטווח ואת הפורמטים שמתקבלים בפועל.
      `הזינו סכום חודשי בין ₪${MIN_SPEND} ל-₪${MAX_SPEND.toLocaleString("he-IL")} — למשל 220, 1,200 או 220.50.`
    : monthlySpend >= MAX_SPEND
      ? // ⚠️ "הסכום הוגבל" נאמר גם למי שהקליד 5,000 במדויק — הקיטום
        // ב-`onChange` מוחק את הקלט המקורי, ולכן אי אפשר להבחין בין
        // קיטום לבין סכום תקין. הנוסח מתאר את התקרה במקום להאשים
        // את המשתמש בקלט שלא בהכרח הקליד.
        `${shekels(MAX_SPEND)} הוא הסכום הגבוה ביותר שהמחשבון מטפל בו — לחשבון גדול יותר נציג יבדוק אתכם ידנית.`
      : "";

  return (
    <Card className="p-5 sm:p-6">
      {/*
        ⚠️ הפס עצמו נשאר דקורטיבי, אבל הוא היה **כל** מה שסימן התקדמות:
        לקורא מסך המחשבון נראה כמסך אחד שמחליף תוכן בלי הסבר. השורה
        המוסתרת מכריזה על המעבר, ולכן חייבת לחיות מחוץ ל-`aria-hidden`.
      */}
      <div className="mb-5 flex items-center gap-2" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full transition ${i <= step ? "bg-lp-brand" : "bg-lp-surface-3"}`}
          />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        שלב {step + 1} מתוך 3
      </p>

      {step === 0 && (
        <div>
          <h3 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-lp-ink outline-none">על מה תרצו לחסוך?</h3>
          <p className="mt-1 text-sm text-lp-ink-2">נשווה מול הקטלוג המלא שלנו ונראה לכם כמה אפשר לחסוך.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(
              [
                ["cellular", "סלולר", "חבילות לכל הקווים במשפחה"],
                ["home", "אינטרנט וטלוויזיה", "סיבים, טריפל וטלוויזיה"],
              ] as const
            ).map(([key, title, sub]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTrack(key);
                  // כניסה מחדש לשלב הסכום מתחילה נקייה — בלי שגיאה
                  // מלחיצה קודמת שתופיע לפני שהוקלד תו.
                  setAttempted(false);
                  setBlurred(false);
                  setStep(1);
                }}
                className="rounded-lp-card border border-lp-line p-4 text-start transition hover:border-lp-brand hover:bg-lp-brand/5"
              >
                <span className="block font-semibold text-lp-ink">{title}</span>
                <span className="mt-0.5 block text-xs text-lp-ink-3">{sub}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-lp-ink-3">
            מחפשים הנחה בחשמל? הלשונית &quot;חשמל&quot; בקטלוג שמתחת מציגה את כל המסלולים.
          </p>
        </div>
      )}

      {step === 1 && (
        <div>
          <h3 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-lp-ink outline-none">כמה אתם משלמים היום?</h3>
          <p className="mt-1 text-sm text-lp-ink-2">הסכום החודשי הכולל שאתם משלמים כרגע.</p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-lp-ink-2" htmlFor="calc-spend">
                תשלום חודשי כולל (₪)
              </label>
              <input
                id="calc-spend"
                value={spend}
                /*
                  ⚠️ הקיטום ל-MAX_SPEND חייב לחזור אל השדה עצמו. בלעדיו
                  מי שהקליד 9000 ראה את 9000 בשדה בזמן שהמסך אמר ₪5,000,
                  והנציג קיבל בהערה סכום שהלקוח מעולם לא הזין —
                  `maxLength={6}` מאפשר להגיע לפער הזה בקלות.
                */
                onChange={(e) => {
                  const next = e.target.value;
                  const parsed = parseSpend(next);
                  // ⚠️ באותו פורמט שהרמז מתחת מציג ("5,000 ₪") — `parseSpend`
                  // מקבל מפריד אלפים, והשדה לא סותר את ההסבר שלידו.
                  setSpend(parsed >= MAX_SPEND ? MAX_SPEND.toLocaleString("he-IL") : next);
                  // ⚠️ אותו כלל של `blurred`, רק לדגל השני: אחרי לחיצה על
                  // ה-CTA בשדה ריק `attempted` נשאר דלוק, וכל מצב ביניים
                  // של `1,200` (`1,` `1,2` `1,20`) הכריז שוב "הזינו סכום".
                  // ההסבר חוזר ב-blur או בלחיצה הבאה — לא בכל הקשה.
                  setAttempted(false);
                }}
                onBlur={() => setBlurred(true)}
                /*
                  ⚠️ Enter בשדה יחיד הוא הפעולה הטבעית ביותר, ולא היה
                  מחובר לכלום: אין `<form>` עוטף וכל הכפתורים הם
                  `type="button"`, ולכן implicit submission לא קיים. בנייד
                  `inputMode="decimal"` מציג מקש "אישור" שלא עשה דבר.
                */
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  submitSpend();
                }}
                inputMode="decimal"
                /*
                  ⚠️ 10 ולא 6. `₪ 1,200` (7 תווים, כפי שהסכום מופיע
                  בחשבונית) נחתך ל-`₪ 1,20` ונפסל, ו-`1,200.50` נחתך
                  ל-`1,200.` — שני פורמטים ש-`parseSpend` מקבל בשלמותם
                  נדחו בגלל התקרה, והמסך האשים את המשתמש בקלט לא-מספרי.
                  `₪ 5,000.00` הוא הארוך ביותר שהמחשבון מטפל בו.
                */
                maxLength={10}
                placeholder="למשל 220"
                /*
                  ⚠️ `fieldClass` כמו כל שדה אחר בדף, ולא מחרוזת מקומית. בלי
                  `bg-lp-surface text-lp-ink` השדה ירש `color-scheme: dark`
                  מהמעטפת אצל מי שהטלפון שלו במצב כהה — טקסט בהיר על כרטיס לבן.
                */
                className={`nums ${fieldClass.replace("text-sm", "text-lg")}`}
                /* קורא מסך שמע את ההודעה אבל לא ידע שהשדה עצמו שגוי. */
                aria-invalid={invalidSpend || undefined}
                aria-describedby="calc-spend-hint"
              />
              <p
                id="calc-spend-hint"
                aria-live="polite"
                className={`mt-1.5 text-xs text-lp-ink-3 ${spendHint ? "" : "sr-only"}`}
              >
                {spendHint || "הזינו את הסכום שאתם משלמים היום בחודש, בשקלים."}
              </p>
            </div>
            {track === "cellular" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-lp-ink-2" htmlFor="calc-units">
                  כמה קווים?
                </label>
                <select
                  id="calc-units"
                  value={units}
                  onChange={(e) => setUnits(Number(e.target.value))}
                  className={fieldClass.replace("py-2.5", "py-3")}
                >
                  {/*
                    ⚠️ עד 10 ובלי "ומעלה". האפשרות הישנה הוצגה כ-"6 ומעלה"
                    אבל חושבה כ-6 בדיוק: משפחה עם 8 קווים קיבלה עלות חדשה
                    של 6 קווים מול חשבון של 8 — כלומר חיסכון מנופח — והנציג
                    קיבל בהערה מספר קווים שגוי.
                  */}
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStep(0)}
              className="inline-flex min-h-11 items-center rounded-lg border border-lp-line px-4 py-2.5 text-sm text-lp-ink-2 hover:border-lp-brand"
            >
              חזרה
            </button>
            <button
              type="button"
              /*
                ⚠️ `aria-disabled` ולא `disabled`. כפתור מושבת אמיתי יוצא
                מסדר המקלדת, כלומר משתמש מקלדת מגיע לסוף הכרטיס בלי לפגוש
                את ה-CTA ובלי לדעת שחסר סכום. כך הוא נשאר בר-מיקוד,
                מכריז על עצמו כמושבת, ומצביע להסבר שליד השדה.
              */
              aria-disabled={monthlySpend <= 0}
              /*
                ⚠️ הקישור קבוע ולא מותנה ב-`spendHint`. בכניסה לשלב
                הכפתור כבר מכריז על עצמו כמושבת אבל ההסבר עוד לא נכתב,
                כלומר קורא מסך שמע "לחצן, מושבת" בלי סיבה — בדיוק המצב
                שההערה למעלה מבטיחה שלא יקרה. הפסקה קיימת תמיד ב-DOM
                ונושאת נוסח ניטרלי כשאין שגיאה.
              */
              aria-describedby="calc-spend-hint"
              onClick={submitSpend}
              className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-lp-brand px-4 py-2.5 text-sm font-semibold text-lp-ink-invert transition hover:bg-lp-brand-bright ${monthlySpend <= 0 ? "opacity-40" : ""}`}
            >
              חשבו לי את החיסכון
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          {/*
            ⚠️ התוצאה עצמה לא הוכרזה. אזור ה-`aria-live` היחיד בכרטיס אמר
            "שלב 3 מתוך 3", והמספר הגדול ישב בפסקה בלי כותרת ובלי
            `role="status"` — מי שביקש חישוב שמע שהשלב התחלף ולא מה
            התשובה. הכותרת הזו היא גם יעד הפוקוס של השלב, ולכן היא נושאת
            את הסכום עצמו. `sr-only` כדי לא לכפול את הכותרת הוויזואלית.
          */}
          <h3 ref={headingRef} tabIndex={-1} className="sr-only outline-none">
            {worthwhile
              ? `אפשר לחסוך עד ${shekels(yearlySaving)} בשנה, ${shekels(monthlySaving)} בחודש`
              : noMatch
                ? "לא נמצאה בקטלוג חבילה להשוואה אוטומטית — נציג יבדוק ידנית"
                : "לפי הסכום שהזנתם לא נמצא חיסכון בתשלום החודשי"}
          </h3>
          {worthwhile ? (
            <>
              <p className="text-sm text-lp-ink-2">
                אתם משלמים <span className="nums font-semibold text-lp-ink">{shekels(monthlySpend)}</span> בחודש.
              </p>
              <p className="mt-1 text-sm font-semibold text-lp-ink">אפשר לחסוך עד</p>
              <p className="nums mt-1 text-3xl font-extrabold break-words text-lp-save sm:text-5xl sm:leading-none">
                {shekels(yearlySaving)}
              </p>
              <p className="mt-1.5 text-sm text-lp-ink-2">
                בשנה —{" "}
                <span className="nums font-semibold text-lp-ink">{shekels(monthlySaving)}</span>{" "}
                כל חודש שנשאר אצלכם.
              </p>

            </>
          ) : noMatch ? (
            <>
              <p className="text-lg font-bold text-lp-ink">כאן צריך בן אדם</p>
              <p className="mt-1 text-sm text-lp-ink-2">
                בקטגוריה הזו אין כרגע חבילה שאפשר להשוות אליה אוטומטית בלי לנחש מה יקרה בתום
                ההטבה. השאירו פרטים ונציג יעבור על החשבון שלכם ידנית.
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-lp-ink">אתם כבר משלמים מעט יחסית</p>
              <p className="mt-1 text-sm text-lp-ink-2">
                לפי הסכום שהזנתם לא נוכל להבטיח חיסכון בתשלום החודשי. עדיין שווה בדיקה — לפעמים
                ההבדל הוא במה שכלול, או במחיר שיקפוץ בתום ההטבה הנוכחית שלכם.
              </p>
            </>
          )}

          {/*
            ⚠️ ההסתייגות חיה **מחוץ** לשלושת הענפים, ולא רק בענף החיובי.
            כשהיא ישבה בתוך `worthwhile`, מי שקיבל "אתם כבר משלמים מעט
            יחסית" שמע פסק דין בלי לדעת מולי מה נמדד, שקו הטלפון שלו לא
            נכלל בהשוואה, ולאיזה תאריך המחירים נכונים. שלוש האמירות
            האלה נחוצות דווקא שם.

            ⚠️ משפט קו הטלפון במסלול הבית אינו קישוט. `isComparable`
            דורשת אינטרנט **וגם** טלוויזיה ובמכוון אינה דורשת טלפון
            (ראה `savings.ts`), ההערה שם מניחה שההסתייגות נאמרת כאן —
            והיא לא נאמרה מעולם. 6 מתוך 9 חבילות הבית בבריכה הן ללא קו
            טלפון, בעוד כפתור המסלול מזמין במפורש בעלי טריפל. בלי
            המשפט הזה מוצג לבעל טריפל חיסכון מול מוצר שחסר בו שירות.
          */}
          <p className="mt-4 text-xs leading-relaxed text-lp-ink-3">
            {!noMatch && (
              <>
                החישוב מבוסס על החבילה המשתלמת ביותר בקטלוג שלנו בקטגוריה הזו
                {track === "cellular" ? `, לפי ${unitsLabel(track, units)}` : ""}, ולפי{" "}
                <strong className="font-semibold text-lp-ink-2">המחיר שנשאר גם אחרי תום ההטבה</strong>{" "}
                — ולא לפי מחיר מבצע שמסתיים.{" "}
              </>
            )}
            {/* ⚠️ גם המשפט הזה בתוך `!noMatch`: אחרי "אין חבילה להשוות אליה" אין מולי מה להשוות. */}
            {track === "home" && !noMatch
              ? "ההשוואה נעשית מול חבילה שכוללת אינטרנט וטלוויזיה; קו טלפון אינו נדרש בה ואינו בהכרח כלול — אם יש קו בחשבון שלכם, הנציג יתמחר אותו בנפרד. "
              : ""}
            עלויות חד-פעמיות (מעבר, חיבור, התקנה) אינן נכללות, והסכום המדויק תלוי בזמינות, בתנאי
            החברה ובמה שכלול היום בחשבון שלכם — נציג יעבור אתכם על החשבון ויגיד לכם בדיוק כמה
            תחסכו. מחירי הקטלוג נכונים ל-{CATALOG_DATE}.
          </p>

          <div className="mt-5 rounded-lp-card bg-lp-surface-2 p-4">
            <p className="mb-3 text-sm font-semibold text-lp-ink">
              רוצים שנבדוק את החשבון שלכם לעומק?
            </p>
            <LeadForm
              compact
              /*
                ⚠️ לפי החבילה שנמדדה, ולא "internet" קבוע. ההשוואה הביתית
                דורשת טלוויזיה, והחבילה שנבחרת היא טריפל — הכרטיס שלה מגיש
                ליד כ-"tv", והנציג שמסנן לפי טלוויזיה לא ראה לידים מהמחשבון.
              */
              category={saving.pick ? crmCategory(saving.pick) : track === "cellular" ? "mobile" : "internet"}
              note={[
                `מהמחשבון: משלם היום ${shekels(monthlySpend)} בחודש`,
                unitsLabel(track, units),
                // ⚠️ גם המקרה השלילי נכתב במפורש. בלעדיו הנציג קיבל הערה
                // שנראית חתוכה ולא ידע אם המחשבון לא מצא חיסכון או שפשוט
                // לא רץ.
                worthwhile
                  ? `חיסכון פוטנציאלי ${shekels(yearlySaving)} בשנה`
                  : noMatch
                    ? "המחשבון לא מצא חבילה להשוואה — דורש בדיקה ידנית"
                    : "המחשבון לא מצא חיסכון בתשלום החודשי",
                /*
                  ⚠️ החבילה שהמספר נגזר ממנה. על המסך היא במכוון אינה
                  נקובה בשם (ראה ההערה בראש הקובץ), אבל הנציג שמתקשר
                  החזיק "חיסכון ₪1,020 בשנה" בלי שום דרך לשחזר מולי מה
                  הוא נמדד ולפי איזה קטלוג — כלומר מספר שהוא לא יכול
                  לעמוד מאחוריו בשיחה.
                */
                saving.pick
                  ? `מול ${saving.pick.provider.name} — ${saving.pick.name}, ${shekels(perLinePrice(saving.pick, units))} ${track === "cellular" ? "לקו" : "לחודש"} (קטלוג ${CATALOG_DATE})`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          </div>

          <button
            type="button"
            /*
              ⚠️ איפוס `attempted`/`blurred`. בלעדיו חזרה לעריכה וניקוי
              השדה הציגה שגיאה מיד — לפני שהמשתמש הספיק להקליד תו אחד.
            */
            onClick={() => {
              setAttempted(false);
              setBlurred(false);
              setStep(1);
            }}
            className="-mx-1 mt-3 inline-flex min-h-11 items-center px-1 text-xs text-lp-ink-3 hover:underline"
          >
            לשנות את הנתונים
          </button>
        </div>
      )}
    </Card>
  );
}
