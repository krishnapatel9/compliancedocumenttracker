// Guards the node-cron contract the scheduler relies on (expression, time zone, task handle).
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const cron = require('node-cron');

test('the daily expression is valid and a 5-field cron with a time zone can be scheduled and destroyed', async () => {
    assert.equal(cron.validate('0 0 * * *'), true);
    assert.equal(cron.validate('not a cron'), false);
    const task = cron.schedule('0 0 * * *', () => {}, { timezone: 'Asia/Kolkata', noOverlap: true, name: 'test' });
    assert.equal(typeof task.destroy, 'function');
    await task.destroy();
});

test('scheduled callbacks run and stop after destroy()', async () => {
    let runs = 0;
    const task = cron.schedule('* * * * * *', () => { runs++; }, { timezone: 'UTC' });
    await new Promise((r) => setTimeout(r, 2300));
    await task.destroy();
    const atDestroy = runs;
    assert.ok(atDestroy >= 1, `expected at least one run, got ${atDestroy}`);
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(runs, atDestroy, 'no runs after destroy');
});
