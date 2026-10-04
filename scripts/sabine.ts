// Sabine's scripted answers, shared by the simulations (mock app and ERPNext).

export const SABINE: [RegExp, string][] = [
  [/0400|capex|moved invoice 4471|4471.*(change|moved)/i, "That's a spindle unit — equipment. Equipment over 5,000 euros is always capex, so it goes to 0400, not maintenance. And no asset number, no capex booking: I get the number from the fixed-asset team first."],
  [/approval|10,000|ten thousand|Fischer|4472/i, "Everything from our Czech subsidiary goes to Dr. Fischer in controlling for a second approval, no matter the amount — transfer pricing. I never post intercompany without the controller."],
  [/history|Nordlicht|4473/i, "Nordlicht double-bills every December. The 4473 has exactly the same amount as 4468 from the second, so it is a duplicate — I put it on hold and ask them for a credit note."],
  [/without|cost center|coding|safe/i, "If the line category matches the pre-coded cost center, like freight on 4800 or cleaning on 4720, I leave it. I only touch the coding when it doesn't fit."],
  [/never seen|new supplier|unknown/i, "A supplier I have never seen with equipment that expensive — I stop and ask the controller before booking anything."],
  [/wrong|month-end|goes wrong/i, "The classic is posting fails because the approval is still pending. Then you check the workflow box and chase the approver — for Fischer, a call works faster than email."],
  [/order/i, "The order doesn't matter there, as long as both happen before posting."],
  [/stop and ask|would not|exception/i, "If the amount is above 50,000 euros I always involve the CFO, whatever the cost center."],
];
export const answerFor = (q: string) => SABINE.find(([re]) => re.test(q))?.[1] ?? "I just know it from experience — it's how we've always done it.";
