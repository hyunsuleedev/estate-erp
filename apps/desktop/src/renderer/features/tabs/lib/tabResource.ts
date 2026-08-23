const DRAFT_ROUTE_ENTITIES = new Map<string, string>([
  ['/properties/new', 'property'],
  ['/contacts/new', 'contact'],
  ['/buyer-requirements/new', 'buyer-requirement'],
]);

const STATIC_PROPERTY_ROUTES = new Set([
  '/properties',
  '/properties/external-listings',
  '/properties/my-ads',
  '/properties/naver-my-ads',
]);

function encodeKeyPart(value: string): string {
  return encodeURIComponent(value);
}

/** full href에서 metadata/identity 판별에 쓰는 canonical pathname만 꺼낸다. */
export function getTabPathname(href: string): string {
  const queryIndex = href.indexOf('?');
  const hashIndex = href.indexOf('#');
  const cutAt = [queryIndex, hashIndex]
    .filter((index) => index >= 0)
    .reduce((minimum, index) => Math.min(minimum, index), href.length);
  const rawPathname = href.slice(0, cutAt) || '/';
  if (rawPathname === '/') return rawPathname;
  return rawPathname.replace(/\/+$/, '') || '/';
}

export const tabResourceKeys = {
  launcher(tabId: string): string {
    return `launcher:${encodeKeyPart(tabId)}`;
  },

  module(href: string): string {
    return `module:${encodeKeyPart(getTabPathname(href))}`;
  },

  entity(entity: string, id: string): string {
    return `entity:${encodeKeyPart(entity)}:${encodeKeyPart(id)}`;
  },

  draft(entity: string, tabId: string): string {
    return `draft:${encodeKeyPart(entity)}:${encodeKeyPart(tabId)}`;
  },
};

function decodeRoutePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * 주소는 화면 상태, resourceKey는 업무 identity다.
 * search/hash는 반드시 route에 보존하지만 entity/module identity에는 포함하지 않는다.
 */
export function resolveTabResourceKey(href: string, tabId: string): string {
  const pathname = getTabPathname(href);
  const draftEntity = DRAFT_ROUTE_ENTITIES.get(pathname);
  if (draftEntity) {
    return tabResourceKeys.draft(draftEntity, tabId);
  }

  const property = STATIC_PROPERTY_ROUTES.has(pathname)
    ? null
    : pathname.match(/^\/properties\/([^/]+)$/);
  if (property) {
    return tabResourceKeys.entity('property', decodeRoutePart(property[1]));
  }

  const contact = pathname.match(/^\/contacts\/([^/]+)$/);
  if (contact) {
    return tabResourceKeys.entity('contact', decodeRoutePart(contact[1]));
  }

  const buyerRequirement = pathname.match(
    /^\/buyer-requirements\/([^/]+)(?:\/edit)?$/,
  );
  if (buyerRequirement) {
    return tabResourceKeys.entity(
      'buyer-requirement',
      decodeRoutePart(buyerRequirement[1]),
    );
  }

  return tabResourceKeys.module(pathname);
}
