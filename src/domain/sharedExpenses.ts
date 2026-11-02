export function yourShareClp(totalClp: number, people: number): number {
  if (!Number.isInteger(totalClp)) {
    throw new Error('totalClp debe ser entero');
  }
  if (people < 1) {
    throw new Error('people debe ser al menos 1');
  }
  return Math.round(totalClp / people);
}

export function totalFromYourShareClp(yourShareClp: number, people: number): number {
  if (people < 1) {
    throw new Error('people debe ser al menos 1');
  }
  return yourShareClp * people;
}
