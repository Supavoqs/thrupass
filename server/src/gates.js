// Static gate/zone config for the demo event.
const GATES = {
  'gate-b-lane-3': { label: 'GATE B · LANE 3', gateLabel: 'Gate B', zone: 'Main', zoneLabel: 'Main Arena' },
};

const ANTI_PASSBACK_WINDOW_MS = 45_000;

module.exports = { GATES, ANTI_PASSBACK_WINDOW_MS };
