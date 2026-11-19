import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DAY_END,
  DAY_START,
  GROUND,
  SUN_TOP,
  ambient,
  bandPath,
  cloudDecks,
  hasPrecip,
  luminary,
  precipAtX,
  sceneState,
  seasonOf,
  sunTimes,
  xAt,
  type WeatherKind,
} from '../src/renderer/routes/_authenticated/-dashboard-sky';

/** 한국 표준시 */
const KST = 9;
const SEOUL: [number, number] = [37.57, 126.98];

describe('dashboard sky', () => {
  it('computes sunrise and sunset for the day within a few minutes', () => {
    // 2026-11-19 서울: 일출 07:16쯤, 일몰 17:19쯤
    const november = sunTimes(new Date(2026, 10, 19), ...SEOUL, KST);
    assert.ok(Math.abs(november.sunrise - 7.27) < 0.15, `sunrise ${november.sunrise}`);
    assert.ok(Math.abs(november.sunset - 17.32) < 0.15, `sunset ${november.sunset}`);
    // 하지 무렵: 일출 05:11쯤, 일몰 19:57쯤
    const june = sunTimes(new Date(2026, 5, 21), ...SEOUL, KST);
    assert.ok(Math.abs(june.sunrise - 5.18) < 0.15, `sunrise ${june.sunrise}`);
    assert.ok(Math.abs(june.sunset - 19.95) < 0.15, `sunset ${june.sunset}`);
  });

  it('keeps the sun over the current time and above the rooftops, and swaps to the moon after sunset', () => {
    const noon = luminary(12.5, 7.27, 17.32);
    assert.equal(noon.sunUp, true);
    assert.equal(noon.x, xAt(12.5));
    assert.ok(noon.y >= SUN_TOP && noon.y <= SUN_TOP + 10);
    // 해가 뜬 직후에는 지평선 가까이에 있다
    assert.ok(luminary(7.3, 7.27, 17.32).y > GROUND - 10);
    // 해가 진 뒤에도 시간 축 안이면 달이 지금 시각 위에 있다
    const evening = luminary(19, 7.27, 17.32);
    assert.equal(evening.sunUp, false);
    assert.equal(evening.offAxis, false);
    assert.equal(evening.x, xAt(19));
    // 시간 축 밖(20시 뒤, 06시 전)에는 한쪽에 떠 있다
    assert.equal(luminary(22, 7.27, 17.32).offAxis, true);
    assert.equal(luminary(5, 7.27, 17.32).offAxis, true);
  });

  it('turns the board dark at night so the text can flip to light', () => {
    assert.equal(ambient(12, 'clear', 7.27, 17.32).tone, 'light');
    assert.equal(ambient(22, 'clear', 7.27, 17.32).tone, 'dark');
    assert.equal(ambient(22, 'rain', 7.27, 17.32).tone, 'dark');
    // 낮에는 궂은 날에도 글자가 어두운 채로 읽힌다
    for (const wx of ['cloudy', 'rain', 'snow', 'thunder', 'fog'] as WeatherKind[]) {
      assert.equal(ambient(13, wx, 7.27, 17.32).tone, 'light', wx);
    }
  });

  it('lays clouds only over the hours they are forecast for', () => {
    const mixed = (hour: number): WeatherKind => (hour < 11 ? 'clear' : hour < 13 ? 'partly' : hour < 15 ? 'cloudy' : 'rain');
    const decks = cloudDecks(mixed);
    assert.deepEqual(
      decks.map((deck) => [deck.kind, deck.h1, deck.h2]),
      [
        ['cloudy', 13, 15],
        ['rain', 15, DAY_END],
      ],
    );
    assert.ok(decks[0].x1 < xAt(13) && decks[0].x2 > xAt(15));
    // 맑은 날과 구름 조금인 날에는 구름층이 없다 (구름 조금은 낱개 구름으로 그린다)
    assert.deepEqual(cloudDecks(() => 'clear'), []);
    assert.deepEqual(cloudDecks(() => 'partly'), []);
    // 하루 종일 흐리면 한 묶음이 시간 축 전체를 덮는다
    const overcast = cloudDecks(() => 'cloudy');
    assert.equal(overcast.length, 1);
    assert.deepEqual([overcast[0].h1, overcast[0].h2], [DAY_START, DAY_END]);
    for (const deck of [...decks, ...overcast]) {
      for (const path of [deck.front, deck.back]) {
        assert.match(path, /^M/);
        assert.doesNotMatch(path, /NaN|undefined|Infinity/);
      }
    }
    assert.doesNotMatch(bandPath(0, 60, 22, 12, 3), /NaN|undefined/);
  });

  it('draws a clear day when the weather is unknown, and rains only where it is forecast', () => {
    const date = new Date(2026, 10, 19);
    const unknown = sceneState(13, date);
    assert.equal(unknown.wx, 'clear');
    assert.deepEqual(unknown.decks, []);
    assert.equal(hasPrecip(unknown), false);

    const hourly = Array.from({ length: 24 }, (_, hour): WeatherKind => (hour < 15 ? 'clear' : 'rain'));
    const afternoonRain = sceneState(12, date, { now: 'clear', hourly });
    assert.equal(afternoonRain.wx, 'clear');
    assert.equal(hasPrecip(afternoonRain), true);
    assert.equal(precipAtX(afternoonRain, xAt(10)), null);
    assert.deepEqual(precipAtX(afternoonRain, xAt(17)), { kind: 'rain', heavy: false });
    // 시간 축 밖의 시각에는 지금 날씨가 전체에 깔린다
    const night = sceneState(22, date, { now: 'snow', hourly });
    assert.equal(night.wx, 'snow');
    assert.deepEqual(precipAtX(night, xAt(10)), { kind: 'snow', heavy: false });
  });

  it('picks the season from the month', () => {
    assert.equal(seasonOf(new Date(2026, 3, 1)), 'spring');
    assert.equal(seasonOf(new Date(2026, 6, 1)), 'summer');
    assert.equal(seasonOf(new Date(2026, 10, 19)), 'autumn');
    assert.equal(seasonOf(new Date(2026, 0, 10)), 'winter');
  });
});
