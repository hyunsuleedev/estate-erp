import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  saveViewingSchedule,
  ViewingStageMoveError,
} from '../src/renderer/routes/_authenticated/properties/-components/inspector-viewing-schedule';

type FakeEvent = { id: string };

function createFakeCalendar() {
  const calls = { create: 0, update: [] as string[] };
  let nextId = 1;
  return {
    calls,
    create: async (): Promise<FakeEvent> => {
      calls.create += 1;
      return { id: `event-${nextId++}` };
    },
    update: async (eventId: string): Promise<FakeEvent> => {
      calls.update.push(eventId);
      return { id: eventId };
    },
  };
}

const notFound = new Error('not found');
const ignoreSaved = (event: FakeEvent) => void event;

describe('inspector viewing schedule', () => {
  it('reuses the saved event on retry even when the match cache lost it', async () => {
    const calendar = createFakeCalendar();
    const savedEventIds = new Map<string, string>();
    let stageAttempts = 0;
    const moveStage = async () => {
      stageAttempts += 1;
      if (stageAttempts === 1) throw new Error('stage update failed');
    };

    // 1차: 일정 생성 성공 → 임장 단계 변경 실패
    await assert.rejects(
      saveViewingSchedule({
        matchId: 'match-1',
        upcomingEventId: null,
        savedEventIds,
        create: calendar.create,
        update: calendar.update,
        isNotFound: (error) => error === notFound,
        onSaved: ignoreSaved,
        moveStage,
      }),
      (error: unknown) =>
        error instanceof ViewingStageMoveError && /방문 일정은 저장했지만/.test(error.message),
    );

    // 2차: 이전 조회 응답이 캐시를 덮어써 매칭에 일정이 없다(upcomingEventId: null).
    await saveViewingSchedule({
      matchId: 'match-1',
      upcomingEventId: null,
      savedEventIds,
      create: calendar.create,
      update: calendar.update,
      isNotFound: (error) => error === notFound,
      onSaved: ignoreSaved,
      moveStage,
    });

    assert.equal(calendar.calls.create, 1, 'the event must be created only once');
    assert.deepEqual(calendar.calls.update, ['event-1'], 'the retry must update the saved event');
  });

  it('forgets the event after a complete save so a later visit does not overwrite a past one', async () => {
    const calendar = createFakeCalendar();
    const savedEventIds = new Map<string, string>();
    const schedule = () =>
      saveViewingSchedule({
        matchId: 'match-1',
        // 첫 방문이 지나 다가오는 일정이 없다
        upcomingEventId: null,
        savedEventIds,
        create: calendar.create,
        update: calendar.update,
        isNotFound: (error) => error === notFound,
        onSaved: ignoreSaved,
        moveStage: async () => undefined,
      });

    await schedule();
    assert.equal(savedEventIds.has('match-1'), false, 'a complete save must not stay remembered');
    await schedule();

    assert.equal(calendar.calls.create, 2, 'a new visit gets its own event');
    assert.deepEqual(calendar.calls.update, [], 'the past visit must not be overwritten');
  });

  it('prefers the event found in the match cache', async () => {
    const calendar = createFakeCalendar();
    await saveViewingSchedule({
      matchId: 'match-1',
      upcomingEventId: 'cached-event',
      savedEventIds: new Map([['match-1', 'older-event']]),
      create: calendar.create,
      update: calendar.update,
      isNotFound: () => false,
      onSaved: ignoreSaved,
      moveStage: null,
    });
    assert.equal(calendar.calls.create, 0);
    assert.deepEqual(calendar.calls.update, ['cached-event']);
  });

  it('creates a new event only when the remembered one was deleted', async () => {
    const calendar = createFakeCalendar();
    const savedEventIds = new Map([['match-1', 'deleted-event']]);
    await saveViewingSchedule({
      matchId: 'match-1',
      upcomingEventId: null,
      savedEventIds,
      create: calendar.create,
      update: async () => {
        throw notFound;
      },
      isNotFound: (error) => error === notFound,
      onSaved: ignoreSaved,
      moveStage: null,
    });
    assert.equal(calendar.calls.create, 1);
    assert.equal(savedEventIds.has('match-1'), false, 'a complete save forgets the event');
  });

  it('does not create a duplicate when updating the remembered event fails for another reason', async () => {
    const calendar = createFakeCalendar();
    await assert.rejects(
      saveViewingSchedule({
        matchId: 'match-1',
        upcomingEventId: null,
        savedEventIds: new Map([['match-1', 'event-1']]),
        create: calendar.create,
        update: async () => {
          throw new Error('network');
        },
        isNotFound: (error) => error === notFound,
        onSaved: ignoreSaved,
        moveStage: null,
      }),
      /network/,
    );
    assert.equal(calendar.calls.create, 0);
  });
});
