/* Metrics derived from the episode log. All values are raw; formatting is the
   caller's job. */

export function computeMetrics(episodes) {
  const total = episodes.length;
  if (total === 0) {
    return {
      total: 0,
      autoRate: 0,
      dollarsNoHuman: 0,
      dollarsTotal: 0,
      thetaAStart: null,
      thetaAFinal: null,
      first5kEpisode: null,
      complaints: 0,
      objections: 0,
      fraudAutos: 0,
      rewardTotal: 0,
      rewardThroughput: 0,
      rewardEscalation: 0,
      rewardComplaint: 0,
    };
  }

  let auto = 0;
  let dollarsNoHuman = 0;
  let dollarsTotal = 0;
  let complaints = 0;
  let objections = 0;
  let fraudAutos = 0;
  let rewardTotal = 0;
  let rewardThroughput = 0;
  let rewardEscalation = 0;
  let rewardComplaint = 0;
  let first5kEpisode = null;

  for (const ep of episodes) {
    const autoApproved = ep.outcome === "auto-approved";
    const complaint =
      ep.groundTruth.humanObjected || (ep.groundTruth.fraud && autoApproved);

    if (autoApproved) {
      auto += 1;
      dollarsNoHuman += ep.invoice.amount;
    }
    dollarsTotal += ep.invoice.amount;
    if (complaint) complaints += 1;
    if (ep.groundTruth.humanObjected) objections += 1;
    if (ep.groundTruth.fraud && autoApproved) fraudAutos += 1;
    if (first5kEpisode === null && ep.params.thetaAAfter >= 5000) {
      first5kEpisode = ep.id;
    }

    rewardTotal += ep.reward.total;
    rewardThroughput += ep.reward.throughput;
    rewardEscalation += ep.reward.escalation;
    rewardComplaint += ep.reward.complaint;
  }

  return {
    total,
    autoRate: (auto / total) * 100,
    dollarsNoHuman,
    dollarsTotal,
    thetaAStart: episodes[0].params.thetaABefore,
    thetaAFinal: episodes[total - 1].params.thetaAAfter,
    first5kEpisode,
    complaints,
    objections,
    fraudAutos,
    rewardTotal,
    rewardThroughput,
    rewardEscalation,
    rewardComplaint,
  };
}
