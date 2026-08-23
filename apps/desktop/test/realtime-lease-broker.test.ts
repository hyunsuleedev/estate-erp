import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RealtimeLeaseBroker } from '../src/main/realtimeLeaseBroker';

function setup() {
  let lease = 0;
  const eligible = new Set<number>();
  const broker = new RealtimeLeaseBroker({
    createLeaseId: () => `lease-${++lease}`,
  });
  return { broker, eligible, isEligible: (id: number) => eligible.has(id) };
}

describe('RealtimeLeaseBroker', () => {
  it('keeps exactly one non-preemptive owner and deterministically fails over', () => {
    const { broker, eligible, isEligible } = setup();
    eligible.add(1);
    eligible.add(2);

    const first = broker.claim(1, 'a', isEligible);
    const second = broker.claim(2, 'b', isEligible);
    assert.equal(first.active, true);
    assert.equal(second.active, false);
    assert.equal(broker.ownerSenderId(), 1);

    broker.unregister(1, isEligible);
    assert.equal(broker.ownerSenderId(), 2);
    assert.equal(broker.snapshotFor(2).active, true);
  });

  it('rejects ineligible candidates until reconciliation makes one eligible', () => {
    const { broker, eligible, isEligible } = setup();
    assert.equal(broker.claim(1, 'a', isEligible).active, false);
    assert.equal(broker.ownerSenderId(), null);

    eligible.add(1);
    broker.reconcile(isEligible);
    assert.equal(broker.snapshotFor(1).active, true);
  });

  it('fences stale StrictMode cleanup with claim and lease identity', () => {
    const { broker, eligible, isEligible } = setup();
    eligible.add(1);
    const old = broker.claim(1, 'old', isEligible);
    const current = broker.claim(1, 'current', isEligible);

    assert.equal(current.active, true);
    assert.notEqual(current.leaseId, old.leaseId);
    assert.equal(broker.release(1, 'old', old.leaseId, isEligible), false);
    assert.equal(broker.snapshotFor(1, 'current').active, true);
    assert.equal(
      broker.release(1, 'current', current.leaseId, isEligible),
      true,
    );
    assert.equal(broker.ownerSenderId(), null);
  });

  it('does not let a returning first shell preempt the current owner', () => {
    const { broker, eligible, isEligible } = setup();
    eligible.add(1);
    eligible.add(2);
    broker.claim(1, 'a', isEligible);
    broker.claim(2, 'b', isEligible);
    broker.unregister(1, isEligible);
    broker.claim(1, 'a-reloaded', isEligible);
    assert.equal(broker.ownerSenderId(), 2);
  });

  it('lets a promoted standby withdraw before it observes its lease', () => {
    const { broker, eligible, isEligible } = setup();
    eligible.add(1);
    eligible.add(2);
    broker.claim(1, 'owner', isEligible);
    const standby = broker.claim(2, 'standby', isEligible);
    assert.equal(standby.active, false);
    assert.equal(standby.leaseId, null);

    broker.unregister(1, isEligible);
    assert.equal(broker.ownerSenderId(), 2);
    assert.equal(broker.release(2, 'standby', null, isEligible), true);
    assert.equal(broker.ownerSenderId(), null);
  });

  it('resets all candidates with fenced inactive snapshots', () => {
    const { broker, eligible, isEligible } = setup();
    eligible.add(1);
    eligible.add(2);
    broker.claim(1, 'a', isEligible);
    broker.claim(2, 'b', isEligible);

    const snapshots = broker.reset();
    assert.deepEqual(
      snapshots.map((snapshot) => [snapshot.claimId, snapshot.active]),
      [
        ['a', false],
        ['b', false],
      ],
    );
    assert.equal(broker.ownerSenderId(), null);
    assert.deepEqual(broker.candidateSenderIds(), []);
  });

  it('waits for an ineligible owner to disconnect before granting a standby', () => {
    const { broker, eligible, isEligible } = setup();
    eligible.add(1);
    eligible.add(2);
    const owner = broker.claim(1, 'a', isEligible);
    broker.claim(2, 'b', isEligible);

    eligible.delete(1);
    broker.reconcile(isEligible);
    const revoked = broker.snapshotFor(1);
    assert.equal(revoked.active, false);
    assert.equal(revoked.leaseId, owner.leaseId);
    assert.equal(broker.ownerSenderId(), 1);
    assert.equal(broker.snapshotFor(2).active, false);

    assert.equal(broker.release(1, 'a', owner.leaseId, isEligible), true);
    assert.equal(broker.ownerSenderId(), 2);
    assert.equal(broker.snapshotFor(2).active, true);
  });

  it('can revoke an otherwise eligible owner for a principal rotation', () => {
    const { broker, eligible, isEligible } = setup();
    eligible.add(1);
    eligible.add(2);
    const owner = broker.claim(1, 'a', isEligible);
    broker.claim(2, 'b', isEligible);

    assert.equal(broker.revokeOwner(), true);
    const revoked = broker.snapshotFor(1);
    assert.equal(revoked.active, false);
    assert.equal(revoked.leaseId, owner.leaseId);
    assert.equal(broker.snapshotFor(2).active, false);
    broker.release(1, 'a', owner.leaseId, isEligible);
    assert.equal(broker.snapshotFor(2).active, true);
  });
});
