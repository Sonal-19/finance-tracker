/** Amounts travel over the API in rupees (2 decimals) and are stored in paise. */
export const toPaise = (rupees: number) => Math.round(rupees * 100);
export const toRupees = (paise: number | string | null | undefined) =>
  Number(paise ?? 0) / 100;
