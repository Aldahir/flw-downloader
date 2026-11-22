// Business rules per plan. Only "free" is active; "pro" is a placeholder until the rules are defined.
export const PLANS = {
  free: { maxParallel: 5 },
  pro: { maxParallel: null }, // TODO(pro): define limits
};
export const activePlan = 'free';
export const maxParallel = () => PLANS[activePlan].maxParallel ?? PLANS.free.maxParallel;
