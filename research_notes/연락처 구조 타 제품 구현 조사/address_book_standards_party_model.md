# Address-book products, standards and the Party/Role model: how a contact is structured (as of Nov 2026)

Reading notes on sourcing: primary documents were read directly for Google People API, Microsoft Graph, Apple `CNContact`/`CNLabeledValue`, RFC 6350, RFC 7095, Fowler's "Organization Structures" PDF, and Google's merge help page. Apple end-user guides, Monica, Silverston, Stack Overflow, MDM and Dex/Clay material came through search-result excerpts or partial pages and is marked "(excerpt)". Anything recalled but not verified in this session is listed under Gaps, not under Cited Findings.

## 1. Field model: names, organization, multi-valued phones/emails with labels and a primary flag; contacts with only a phone number

### Takeaway
All four ecosystems store a structured name plus a separate display/formatted name, and model phones/emails as a list of (value, label) items; they differ in whether labels are open strings (Apple, Google, vCard) or fixed slots (Outlook). "Primary" is an explicit per-item marker in vCard (`PREF`) and Google (`metadata.primary`/`sourcePrimary`); Apple's public API has no primary flag.

### Cited Findings
**vCard 4.0 (RFC 6350)**
- `FN` (formatted name) and `VERSION` are the only mandatory properties: "The property MUST be present in the vCard object." `N` (structured name) has cardinality `*1`, i.e. optional, at most one — [RFC 6350](https://www.rfc-editor.org/rfc/rfc6350.html)
- `N` has five components: "Family Names (also known as surnames), Given Names, Additional Names, Honorific Prefixes, and Honorific Suffixes." `NICKNAME` is separate — [RFC 6350](https://www.rfc-editor.org/rfc/rfc6350.html)
- `ORG` is the organization name "followed by zero or more levels of organizational unit names"; `TITLE` is "the position or job"; `ROLE` is "the function or part played in a particular situation by the object the vCard represents" — [RFC 6350](https://www.rfc-editor.org/rfc/rfc6350.html)
- `TEL` TYPE values: "text", "voice", "fax", "cell", "video", "pager", "textphone" (default "voice"); the general TYPE values "work" and "home" "act like tags" — [RFC 6350](https://www.rfc-editor.org/rfc/rfc6350.html)
- `PREF` parameter: "an integer between 1 and 100 that quantifies the level of preference. Lower values correspond to a higher level of preference, with 1 being most preferred." — [RFC 6350](https://www.rfc-editor.org/rfc/rfc6350.html)
- Property grouping: "The group construct is used to group related properties together" (`[group "."] name`); "X-" names are private extensions "defined bilaterally between two cooperating agents" — [RFC 6350](https://www.rfc-editor.org/rfc/rfc6350.html)
- jCard is the same model as JSON arrays: `["vcard", [[name, params, type, value…]]]`; example `["tel", { "type": ["work", "voice"], "pref": "1" }, "uri", "tel:+1-418-656-9254;ext=102"]`; the group prefix becomes a `"group"` parameter — [RFC 7095](https://www.rfc-editor.org/rfc/rfc7095.html)

**Google People API (`Person`)**
- `names[]`: `displayName` and `displayNameLastFirst` (output only), `unstructuredName`, `familyName`, `givenName`, `middleName`, `honorificPrefix`, `honorificSuffix`, plus six `phonetic*` fields. `nicknames[]` and `fileAses[]` are separate fields — [People API: Person](https://developers.google.com/people/api/rest/v1/people)
- `phoneNumbers[]`: `value`, `canonicalForm` (output only, E.164), `type`, `formattedType`. Predefined types: `home`, `work`, `mobile`, `homeFax`, `workFax`, `otherFax`, `pager`, `workMobile`, `workPager`, `main`, `googleVoice`, `other` — [People API: Person](https://developers.google.com/people/api/rest/v1/people)
- Type is predefined-or-custom for addresses (`home`, `work`, `other`; "custom allowed"); `formattedType` is the localized display of the type — [People API: Person](https://developers.google.com/people/api/rest/v1/people)
- `organizations[]`: `type` (`work`, `school`), `name`, `phoneticName`, `department`, `title`, `jobDescription`, `startDate`, `endDate`, `current`, and more — [People API: Person](https://developers.google.com/people/api/rest/v1/people)
- Every field item carries `FieldMetadata`: `primary` ("True if the field is the primary field for all sources in the person"), `sourcePrimary` ("Each source must have at most one field with `sourcePrimary` set to true"), `verified`, `source` — [People API: Person](https://developers.google.com/people/api/rest/v1/people)
- Four fields are singletons for contact sources: `biographies` (the notes field), `birthdays`, `genders`, `names`. Everything else is a list — [People API: Person](https://developers.google.com/people/api/rest/v1/people)
- Free-form custom fields exist as `userDefined[]` (`key`, `value`); app-private data as `clientData[]` — [People API: Person](https://developers.google.com/people/api/rest/v1/people)

**Apple Contacts framework**
- `CNContact` name fields: `namePrefix`, `givenName`, `middleName`, `familyName`, `previousFamilyName`, `nameSuffix`, `nickname`, `phoneticGivenName`, `phoneticMiddleName`, `phoneticFamilyName`. Work fields: `jobTitle`, `departmentName`, `organizationName`, `phoneticOrganizationName`. One `note` string — [CNContact](https://developer.apple.com/documentation/contacts/cncontact)
- Multi-valued fields are arrays of `CNLabeledValue`: `phoneNumbers`, `emailAddresses`, `postalAddresses`, `urlAddresses`, `socialProfiles`, `instantMessageAddresses`, `dates`, `contactRelations` — [CNContact](https://developer.apple.com/documentation/contacts/cncontact)
- `CNLabeledValue` = `identifier` + `label: String?` + `value`. "Labels describe the context for a property. For example, the label for a phone number indicates whether it corresponds to the user's home, work, or iPhone number." The label is a plain optional string (initializer `init(label: String?, value:)`), with predefined constants such as `CNLabelHome`, `CNLabelWork`, `CNLabelSchool`, `CNLabelOther`, `CNLabelPhoneNumberMain`, `CNLabelPhoneNumberiPhone`, `CNLabelPhoneNumberMobile`, fax and pager variants — [CNLabeledValue](https://developer.apple.com/documentation/contacts/cnlabeledvalue)
- Lookup by phone is a first-class query: `predicateForContacts(matching: CNPhoneNumber)` "Returns a predicate to find the contacts whose phone number matches the specified value." — [CNContact](https://developer.apple.com/documentation/contacts/cncontact)
- No primary/preferred property appears on `CNContact` or `CNLabeledValue` in the reference listing — [CNLabeledValue](https://developer.apple.com/documentation/contacts/cnlabeledvalue)

**Microsoft Graph / Outlook `contact`**
- Name fields are flat scalars: `givenName`, `surname`, `middleName`, `nickName`, `title`, `generation` (suffix), `initials`, `yomiGivenName`, `yomiSurname`, `yomiCompanyName`, plus `displayName` and `fileAs` ("The name the contact is filed under") — [Graph contact resource](https://learn.microsoft.com/en-us/graph/api/resources/contact?view=graph-rest-1.0)
- Phones are fixed slots, not labeled items: `businessPhones` (string collection), `homePhones` (string collection), `mobilePhone` (single string). Addresses are three fixed slots: `homeAddress`, `businessAddress`, `otherAddress` — [Graph contact resource](https://learn.microsoft.com/en-us/graph/api/resources/contact?view=graph-rest-1.0)
- Email has both a collection (`emailAddresses`) and ordered slots (`primaryEmailAddress`, `secondaryEmailAddress`, `tertiaryEmailAddress`) — [Graph contact resource](https://learn.microsoft.com/en-us/graph/api/resources/contact?view=graph-rest-1.0)
- `displayName` can be overwritten by the system: "later updates to other properties may cause an automatically generated value to overwrite the displayName value you have specified." — [Graph contact resource](https://learn.microsoft.com/en-us/graph/api/resources/contact?view=graph-rest-1.0)
- Custom data goes into open extensions / extended properties, not first-class custom fields — [Graph contact resource](https://learn.microsoft.com/en-us/graph/api/resources/contact?view=graph-rest-1.0)

### Inferences
- The shared shape is: one contact row + child rows per contact point, each child having (value, label, optional preferred marker, own stable id). The ERP's `Contact` + `ContactPhone` already has this shape; what the standards add is (a) a label on each phone, (b) a preferred marker, (c) a stable per-item id.
- Every system separates "the name as the user typed/wants it displayed" (`FN`, `displayName`, `unstructuredName`, `fileAs`) from structured name parts. A string like "101동 1203호 김OO 소유주" fits the display/file-as slot; vCard requires only that slot (`FN`), so a contact with no structured name is valid in the standard.
- Apple's label being a free string and Google allowing custom types mean "label" in these products is user vocabulary, not an enum. Outlook's fixed slots are the outlier and force "which slot does this number go in" decisions.
- vCard distinguishes `TITLE` (job) from `ROLE` (function in a situation) as free text on the card. None of the four models carries a business role such as owner/buyer/tenant on the contact; the nearest things are free-text `ROLE`, labels/groups, or custom fields.

### Gaps
- How each UI renders a contact that has only a phone number (believed: the number is shown as the title) was not verified against a source in this session.
- Apple's custom-label UI ("Add Custom Label") and the vCard export form (`itemN.TEL` + `X-ABLabel`) were not verified; RFC 6350 text read here contains no such example.
- Apple's `CNContactType`, `CNPhoneNumber` and `CNContactRelation` member details were not opened individually.
- Whether Google lets a contact be saved with no name at all was not confirmed; the API page only says `names` is a singleton for contact sources.
- CardDAV (RFC 6352) was not read; the task limited sync-protocol detail, and nothing was found that changes the contact model beyond vCard itself.

## 2. Person vs organization

### Takeaway
The standards and products keep people and organizations in one record type with a kind/type discriminator, not in separate tables; company affiliation of a person is usually a text attribute on the person, not a link to an organization record.

### Cited Findings
- vCard `KIND` values are "individual", "group", "org", "location"; "If this property is absent, "individual" MUST be assumed as the default." — [RFC 6350](https://www.rfc-editor.org/rfc/rfc6350.html)
- Apple has `contactType: CNContactType` ("An enum identifying the contact type") on the same `CNContact` class that also holds `organizationName` — [CNContact](https://developer.apple.com/documentation/contacts/cncontact)
- Google stores affiliation as `organizations[]` items on the person (name, department, title, start/end dates, `current`), i.e. text attributes, not references to another contact — [People API: Person](https://developers.google.com/people/api/rest/v1/people)
- Outlook: "A contact is an item in Outlook where you can organize and save information about the people and organizations you communicate with"; one resource type, with `companyName`, `department`, `jobTitle` as strings — [Graph contact resource](https://learn.microsoft.com/en-us/graph/api/resources/contact?view=graph-rest-1.0)
- Fowler's motivating example is literally an address book: "I call 'Oak Grove Taxi' frequently, but there's no person I want to speak to — I just want to call a cab. If I were to model an address book, I might choose to have people and companies, each of which have postal addresses and telephone numbers, but the resulting duplication is painful to the eye. So I need a supertype of person and company." — [Fowler, Organization Structures (Party)](https://martinfowler.com/apsupp/accountability.pdf)
- Fowler also allows the degenerate form: "you should also consider this pattern when you don't need to distinguish between people and organizations. In this case it's useful just to define a party class and not to provide the subtypes." — [Fowler, Organization Structures (Party)](https://martinfowler.com/apsupp/accountability.pdf)

### Inferences
- A single `Contact` table with a kind flag (person / organization) is what address books and Fowler's Party both converge on. Separate Company tables appear in sales CRMs, not in address-book standards.
- For a brokerage, corporate owners, law offices, other brokerages and management offices are "a phone number with no person" in Fowler's sense; a kind flag covers them without a second entity.

### Gaps
- Whether Google Contacts has any explicit person/company discriminator (as opposed to a contact that simply has only an organization name) was not verified.
- How Dex, Clay/Mesh and Monica model companies was not confirmed from their documentation.

## 3. Groups vs labels vs tags

### Takeaway
Membership is many-to-many everywhere except Outlook folders: Google and vCard store it as a list on one side (group ids on the contact, or member list on the group), and Outlook offers both an exclusive container (folder) and a non-exclusive string list (categories).

### Cited Findings
- Google `ContactGroup`: `resourceName`, `name` (must be unique among the user's groups; duplicate returns HTTP 409), `groupType` (`USER_CONTACT_GROUP` or `SYSTEM_CONTACT_GROUP`), `memberCount`, `memberResourceNames` ("The list of contact person resource names that are members of the contact group"), `clientData` — [People API: contactGroups](https://developers.google.com/people/api/rest/v1/contactGroups)
- On the person side, membership is a list: `memberships[]` each holding `contactGroupMembership.contactGroupResourceName` — [People API: Person](https://developers.google.com/people/api/rest/v1/people)
- vCard has two mechanisms: `CATEGORIES` ("application category information about the vCard, also known as "tags"", comma-separated text on the card) and `KIND:group` cards with `MEMBER` properties ("This property MUST NOT be present unless the value of the KIND property is "group"") — [RFC 6350](https://www.rfc-editor.org/rfc/rfc6350.html)
- Outlook: each contact has exactly one `parentFolderId` ("Contacts are contained in contact folders") and a `categories` string collection — [Graph contact resource](https://learn.microsoft.com/en-us/graph/api/resources/contact?view=graph-rest-1.0)
- Apple exposes group membership as a query, `predicateForContactsInGroup(withIdentifier:)`, and a separate account-level partition, `predicateForContactsInContainer(withIdentifier:)` — [CNContact](https://developer.apple.com/documentation/contacts/cncontact)
- Dex: AI Assist "sorts your contacts with Tags based on interests, alma mater, and more" — [Dex docs](https://getdex.com/docs/dex-core)

### Inferences
- Two different things hide under "group": a named, managed set with its own record (Google label, Apple group, vCard group card) and a loose string tag on the contact (vCard `CATEGORIES`, Outlook categories). The ERP currently has both (`ContactGroup` and `tags`), which is the same split vCard has; the ambiguity the owner feels may come from having two overlapping classification tools without a rule for which is used when.
- Google's product decision was to have only one mechanism (labels) and to make system groups a type of the same thing.
- None of these systems uses group/label membership to express a business role with history; membership is a flat, undated set.

### Gaps
- Google's system group list (e.g. starred, "my contacts") and the label UI were not read from a source.
- Apple smart lists and Outlook contact lists (distribution lists) were not verified.
- Whether Dex has groups distinct from tags was not confirmed.

## 4. Relationships between contacts

### Takeaway
Address books store a relationship as a one-sided, labeled pointer or even a labeled name string, with no automatic inverse; only personal CRMs (Monica) store typed relationships with a reverse name, and Monica's own author describes this as a hard, still-open modeling problem.

### Cited Findings
- vCard `RELATED` has predefined TYPE values "contact", "acquaintance", "friend", "met", "co-worker", "colleague", "co-resident", "neighbor", "child", "parent", "sibling", "spouse", "kin", "muse", "crush", "date", "sweetheart", "me", "agent", "emergency" — [RFC 6350](https://www.rfc-editor.org/rfc/rfc6350.html)
- Google `relations[]`: `person` (a name string), `type` from `spouse`, `child`, `mother`, `father`, `parent`, `brother`, `sister`, `friend`, `relative`, `domesticPartner`, `manager`, `assistant`, `referredBy`, `partner`, plus `formattedType` — [People API: Person](https://developers.google.com/people/api/rest/v1/people)
- Apple `contactRelations: [CNLabeledValue<CNContactRelation>]`, "An array of labeled relations for the contact"; Apple ships a very large label vocabulary including elder/younger sibling, in-law and paternal/maternal variants (e.g. `CNLabelContactRelationElderBrother`, `CNLabelContactRelationAuntFathersElderSister`) plus `Assistant`, `Manager`, `Colleague`, `Teacher`, `Friend` — [CNLabeledValue](https://developer.apple.com/documentation/contacts/cnlabeledvalue)
- Outlook stores relations as plain strings on the contact: `spouseName`, `children` (string collection), `assistantName`, `manager` — [Graph contact resource](https://learn.microsoft.com/en-us/graph/api/resources/contact?view=graph-rest-1.0)
- Monica (excerpt): relationship types are account-wide records with `name` and `name_reverse_relationship` and a `relationship_type_group_id` (e.g. love, family); a relationship links two contacts and carries a type id; types were read-only in the documented API — [Monica API: relationship types](https://www.monicahq.com/api/relationshiptypes)
- Monica's founder on why the reverse name exists: "Rachel is Emma's mother, while Emma is Rachel's daughter"; some relations are symmetric ("Chandler and Joey are friends"), some depend on gender, and the model cannot assume English kin terms (Korean "older brother" is cited). Open questions listed: whether to keep relationship history or only current state, whether two people can hold several relationships at once, how to handle "knowing someone's mother but [not] having their mother as a contact", and "the fact that software can infer something doesn't necessarily mean it should." — [Monica blog: modeling relationships](https://monicahq.com/en/blog/modeling-relationships/)
- Monica records one viewpoint only: "your information about the people in your life"; "Monica doesn't have the other person's version of the story." — [Monica blog: modeling relationships](https://monicahq.com/en/blog/modeling-relationships/)
- Fowler's Accountability is the general form of a typed, directed party-to-party link: "Each instance of accounability represents a link between two parties, the accountability type indicates the nature of the link." — [Fowler, Organization Structures (Accountability)](https://martinfowler.com/apsupp/accountability.pdf)

### Inferences
- There are three levels of rigor: (1) labeled name string (Outlook, Google), (2) labeled pointer to another card, one-sided (vCard, Apple), (3) typed link record between two contacts with a reverse name (Monica, Fowler's Accountability). The ERP's `ContactRelation` is level 3.
- Level 3 needs a type record that carries both directions' names; otherwise the same relation reads wrongly from the other contact's page. Monica solves it with `name_reverse_relationship`.
- Monica's "partial contact" question (the spouse you know of but never deal with) matters for brokerage data: co-owners' spouses, proxies and family members who pick up the phone are often known only by a name or a number.
- Apple's vocabulary shows that Korean kinship distinctions (elder/younger, paternal/maternal) are handled as label variants, not as structure.

### Gaps
- Monica's actual schema (`relationship_type_groups` table, whether a relationship is stored as one row or two mirrored rows) was not read from the repository. The Monica blog states v3 is "coming before the end of 2026. Rebuilt from scratch", so the documented API may not match the upcoming model.
- No documentation was found for how Dex or Clay/Mesh model contact-to-contact relationships.
- Whether vCard `RELATED` values are URIs to other cards vs text was not quoted from the RFC in this session.

## 5. Duplicate handling, linking and phone normalization

### Takeaway
There are two distinct designs: Apple links source records into a computed "unified contact" without destroying them, while Google merges into one record and relies on suggestion review plus a time-limited whole-list undo. The standard's only mandatory match key is the card UID; everything else is "at the discretion" of the engine.

### Cited Findings
**Apple: link, do not destroy**
- (excerpt) Contacts from different sources with the same name are linked automatically and shown as one unified contact; manual path is Edit → Link Contacts — [iPhone User Guide: Merge or hide duplicate contacts](https://support.apple.com/guide/iphone/merge-or-hide-duplicate-contacts-iph2ab28320d/16.0)
- (excerpt) "When you link contacts, those contacts aren't merged. If you change or add information in a unified contact, the changes are copied to each source account where that information already exists." — [iPad User Guide: hide duplicate contacts](https://support.apple.com/en-gu/guide/ipad/hide-duplicate-contacts-ipad70ccca56/15.0/ipados)
- (excerpt) Separately, same-account duplicates are surfaced as "Duplicates Found" with per-contact review or "Merge All" — [iPhone User Guide: Merge or hide duplicate contacts](https://support.apple.com/guide/iphone/merge-or-hide-duplicate-contacts-iph2ab28320d/16.0)
- API: `CNContactFetchRequest.unifyResults` is "A Boolean value that indicates whether to return linked contacts as unified contacts" — [CNContactFetchRequest](https://developer.apple.com/documentation/contacts/cncontactfetchrequest)
- API: `isUnifiedWithContact(withIdentifier:)` "Returns a Boolean indicating whether the current contact is a unified contact and includes a contact with the specified identifier." — [CNContact](https://developer.apple.com/documentation/contacts/cncontact)
- (excerpt) A unified `CNContact` has its own identifier, different from the identifiers of the linked source contacts — [Apple Developer Forums thread 803013](https://developer.apple.com/forums/thread/803013)
- (excerpt, third party) The user can choose which linked card's name is used for the unified card — [TechRepublic](https://www.techrepublic.com/article/merge-duplicate-contacts-ios-16/)

**Google: suggest, merge, undo**
- Menu → "Merge & fix"; "If you don't find a 'Merge duplicates' option, you don't have any contacts that you can merge." Suggestions can be accepted one by one ("Merge") or all ("Merge all"); arbitrary contacts can also be selected and merged manually — [Google Contacts Help: Merge duplicate contacts](https://support.google.com/contacts/answer/7078226?hl=en)
- "You can't merge contacts that are saved in different Google Accounts." "You can separate a contact that you merged." — [Google Contacts Help: Merge duplicate contacts](https://support.google.com/contacts/answer/7078226?hl=en)
- (third party) Undo is list-wide, not per contact: "Undo changes resets your entire contact list to how it looked at a moment you pick, up to 30 days back." — [2sync](https://2sync.com/blog/restore-deleted-google-contacts)
- (third party) Suggested pairs can be dismissed so they are excluded from merging — [Covve](https://covve.com/how-to/merge-duplicate-contacts-using-google-contacts)
- The People API exposes merge/link traces: `metadata.sources[]`, `linkedPeopleResourceNames` ("Resource names of people linked to this resource"), `previousResourceNames` ("The resource name may change when adding or removing fields that link a contact and profile") — [People API: Person](https://developers.google.com/people/api/rest/v1/people)

**vCard matching rules**
- "vCard instances for which the UID properties ... are equivalent MUST be matched." Other instances "MAY be matched at the discretion of the synchronization engine." — [RFC 6350 §7](https://www.rfc-editor.org/rfc/rfc6350.html)
- Property-level rules: properties of unmatched cards or with different names "MUST NOT be matched"; properties "whose maximum cardinality is 1, MUST be matched"; same-name properties "whose PID parameters match, MUST be matched". `PID` "plays a role analogous to the UID property on a per-property instance basis." — [RFC 6350 §7](https://www.rfc-editor.org/rfc/rfc6350.html)

**Phone normalization**
- Google returns a server-computed `canonicalForm` in E.164 next to the user-entered `value` for each phone — [People API: Person](https://developers.google.com/people/api/rest/v1/people)
- libphonenumber FAQ: parsing usually strips the national prefix so the library can "store a normalized form of the number"; a default region affects how leading digits are interpreted, and callers whose numbers always include the country code can "put a '+' in front"; locally dialled short forms (e.g. a 7-digit US number) cannot be canonicalized — [libphonenumber FAQ](https://raw.githubusercontent.com/google/libphonenumber/master/FAQ.md)
- libphonenumber FAQ: "Do not rely on libphonenumber to determine whether numbers are currently assigned to a specific user and reachable." — [libphonenumber FAQ](https://raw.githubusercontent.com/google/libphonenumber/master/FAQ.md)

### Inferences
- Storing both the raw input and a canonical form per phone (Google's `value` + `canonicalForm`) is the pattern that serves display and matching at once; caller-ID lookup and duplicate detection both run on the canonical column.
- Apple auto-links on name; that key is weak for Korean data where many customers share a name and are identified by number. For this ERP the canonical phone is the natural deterministic key, with name as a secondary signal.
- A phone number is not a stable identity of a person: libphonenumber's warning about assignment, plus shared family phones and number recycling, mean an exact phone match should produce a suggestion to review (Google's model), not a silent merge.
- Per-item stable ids (`PID`, `CNLabeledValue.identifier`, Google field `metadata.source`) are what make merge and later un-merge tractable: each phone row can remember which original contact it came from.
- Google's undo is a coarse snapshot rollback; Apple's link model makes un-linking trivial because nothing was destroyed. In an ERP where a contact is referenced by properties, deals and contracts, a destructive merge without a record of the absorbed contact cannot be reversed by a snapshot.

### Gaps
- Google's exact matching keys for duplicate suggestions and how conflicting fields are resolved on merge are not documented on the help page ("The page doesn't explain how merged contact details are combined").
- Google's own "Undo changes" help article was not opened; the 30-day figure comes from third-party guides.
- Apple's own text for the link/merge article could not be fetched in full; quotes above come from search-result excerpts of Apple user guides.
- Outlook's duplicate handling (clean-up / linked contacts) was not researched.
- libphonenumber's `isNumberMatch` match levels and Korean-specific number handling (010 mobile, 050 safe numbers, area codes) were not verified from a source.

## 6. UI conventions

### Takeaway
Little of the UI layer is documented in the primary sources reached; what is documented is that sort order and "file as" are data-model concerns, and that personal CRMs add reminders, an interaction timeline and notes on top of an address-book core.

### Cited Findings
- Sort order is part of the model: Apple provides `comparator(forNameSortOrder:)` and `CNContactSortOrder`; Outlook has `fileAs`; Google has `fileAses[]` and `displayNameLastFirst` — [CNContact](https://developer.apple.com/documentation/contacts/cncontact); [Graph contact resource](https://learn.microsoft.com/en-us/graph/api/resources/contact?view=graph-rest-1.0); [People API: Person](https://developers.google.com/people/api/rest/v1/people)
- Apple's built-in search predicates are by name, by phone number, by email address, by group and by container — [CNContact](https://developer.apple.com/documentation/contacts/cncontact)
- Notes are a single free-text field per contact in all three: Apple `note`, Outlook `personalNotes`, Google `biographies` (singleton for contacts) — [CNContact](https://developer.apple.com/documentation/contacts/cncontact); [Graph contact resource](https://learn.microsoft.com/en-us/graph/api/resources/contact?view=graph-rest-1.0); [People API: Person](https://developers.google.com/people/api/rest/v1/people)
- Dex: "Set reminders with Dex to keep in touch with friends regularly, choosing intervals from one month to one year"; Outlook sync gives "email context, interaction timelines"; LinkedIn sync captures "bios, work history, education"; a Map View "pins your contacts on a map according to their locations"; imports from Facebook, Google Contacts, iCloud, Apple Contacts, Google Calendar and CSV — [Dex docs](https://getdex.com/docs/dex-core)
- (third party) Dex "is built around reminders, notes and follow-ups" — [Dex blog: Dex vs Clay](https://getdex.com/blog/dex-vs-clay)
- (third party, competitor-authored) Clay (clay.earth) was renamed Mesh in 2026 — [Happenstance: Dex vs Mesh](https://happenstance.ai/compare/dex-vs-mesh)

### Inferences
- Address books keep one note per contact; personal CRMs replace that with dated entries (notes, interactions, reminders) attached to the contact. An ERP that already has consultations, calls and deals has that timeline in other tables; the contact page's job is to show it, not to store a second copy.
- "File as" exists because the natural sort key is often not the display name. For entries named "101동 1203호 김OO", sorting and searching by unit and by person name are different needs that one string cannot serve; in this ERP the unit side is already structured data (Property), which address books do not have.

### Gaps
- No primary source was reached for list defaults (alphabetical vs recent), detail-card layout, or quick actions in Google, Apple or Outlook; these are well known from use but unverified here.
- Dex's contact fields, custom fields, groups, notes model, merge and search are not covered on the docs page reached; Clay/Mesh help content was not reached at all.
- Monica's contact page structure (activities, reminders, tasks, life events) was not verified.

## 7. Party pattern: Party, Party Role, Party Relationship, Contact Mechanism, Accountability

### Takeaway
The pattern literature supports the ERP's direction: a role is "how a party is involved in some other entity", so it belongs on the link to that entity, and both Fowler and Silverston's critics warn against adopting the full generic machinery before it is needed.

### Cited Findings
**Fowler**
- Party is "An abstraction of people and organizational units"; "Put any behaviror that is common to people and organizational units on Party, only put things particular to one or the other on the subtype." — [Fowler, Organization Structures](https://martinfowler.com/apsupp/accountability.pdf)
- On roles: "If you see parties playing different roles in a business, you'll often see one of the role patterns in play. Coad in particular is a big fan of Role Object. It's a common pattern with party, but isn't one to turn to blindly" — [Fowler, Organization Structures](https://martinfowler.com/apsupp/accountability.pdf)
- Accountability "Represents a complex graph of relationships between parties"; the model is Party (parent) — Accountability — Party (child), each Accountability having one Accountability Type — [Fowler, Organization Structures](https://martinfowler.com/apsupp/accountability.pdf)
- Cost warning: "Accountabilities represent the most powerful, and also the most complex way of dealing with organizational strucutres. So like most of these power tools, you don't get them out unless you really need them." and "Accountability is a good bit more complicated to use than Organization Hierarchy, so don't use it until you need it." — [Fowler, Organization Structures](https://martinfowler.com/apsupp/accountability.pdf)
- Queries become type-qualified: "instead of saying "who are the parents of Boston Sales" you say "who are the regional parents of Boston Sales"." — [Fowler, Organization Structures](https://martinfowler.com/apsupp/accountability.pdf)
- Knowledge level: "The basic form of accountability is quite loose, allowing any combination of parties to be organized in any fashion with any accountability types"; to constrain it, each accountability type holds connection rules, "each of which defines one legal pairing of parent and child party types" (example: patient-care links a consultant to a patient). The diagram also puts a Time Period on Accountability — [Fowler, Organization Structures](https://martinfowler.com/apsupp/accountability.pdf)
- General test for capturing structure at all: "It's important to ask yourself what would happen if you didn't capture the hierarchy. If the consequences are not painful then it's not worth carrying the cost of the links (and above all the costs of maintaining the links)." — [Fowler, Organization Structures](https://martinfowler.com/apsupp/accountability.pdf)

**Silverston (excerpts)**
- The Data Model Resource Book's model list includes party roles, specific and common party relationships, and party contact mechanism models — [Wiley: Len Silverston models](https://books.wiley.com/authors/len-silverston/models)
- (excerpt) A role answers "who is involved": "The "who" is always about how a party (person or organization) is involved in some other entity. In other words, what role is the party playing within the context of a business activity or in the context of another entity" — [The Data Model Resource Book, Vol. 3 (O'Reilly excerpt)](https://www.oreilly.com/library/view/the-data-model/9780470178454/chapter-37.html)
- (excerpt) Declared roles on the party are used as the basis for contextual roles on projects, orders or shipments; a noted weakness of the simple contextual-role pattern is that it "does not account for tracking history of who played what role when" — [The Data Model Resource Book, Vol. 3 (O'Reilly excerpt)](https://www.oreilly.com/library/view/the-data-model/9780470178454/chapter-47.html)
- (excerpt) Contact mechanisms are linked to parties with a purpose and usage in addition to a type: "usage and purpose are relevant within the context of the PARTY's relationship to the CONTACT MECHANISM", and the same number can carry different purposes for different parties — [The Data Model Resource Book, Vol. 3 (O'Reilly excerpt)](https://www.oreilly.com/library/view/the-data-model/9780470178454/chapter-112.html)

**Criticism (excerpts)**
- (excerpt) Stack Overflow answers on the party model warn of "lots of joins" and performance-tuning difficulty, extra layers to reach the data needed for a specific type, and friction with ORMs — [Stack Overflow: principles and benefits of the Party Model](https://stackoverflow.com/questions/716549/what-are-the-principles-behind-and-benefits-of-the-party-model)
- (excerpt) "all these elegant normalized database structures are elegant and normalized, but they also add a lot more complexity" — [Mahara wiki: database design strategies](https://wiki.mahara.org/wiki/Developer_Area/Database_design_strategies)

### Inferences
- Silverston distinguishes a declared role (the party is "a customer" in general) from a contextual role (the party's role in this order). The ERP stores only contextual roles: owner of this property, buyer in this request, tenant in this contract. That is the stricter reading of the pattern and avoids a role field that goes stale.
- What the ERP gives up by having no declared role is a cheap answer to "show me all owners" or "what is this person to us". The pattern's answer is to derive it from the contextual links (the AGENTS.md already says the customer ledger is a query result). The "ambiguity" may be a presentation gap, i.e. the contact card does not summarize derived roles, more than a structural flaw.
- Silverston's history criticism applies directly: an ownership or tenancy link needs from/to dates (Fowler's Accountability also carries a Time Period), otherwise a former owner and a current owner look the same.
- Contact-to-contact links (`ContactRelation`) are a small Accountability. Fowler's advice is to keep the type list short and add connection rules only when invalid pairings become a real problem.
- Silverston's contact-mechanism model implies a phone can belong to more than one party with a different purpose each (a shared home line, a spouse answering for the owner). The ERP's `ContactPhone` as a child of exactly one contact cannot represent that; whether that matters depends on how often caller ID hits a shared number.
- A simplified variant consistent with all sources: one Contact table with a kind flag (Party without subtypes), child contact-point rows with label and purpose, typed contact-to-contact links with reverse names, and roles only on links to business objects, with dates.

### Gaps
- Silverston's books were not read directly; statements come from publisher listings and O'Reilly excerpt snippets, and the chapter-to-claim mapping in the citations above was not individually confirmed. The excerpts are from Volume 3 (patterns), not the Volume 1 Party chapter.
- Fowler's Role Object and Typed Relationship patterns, referenced in the PDF, were not opened.
- The Stack Overflow thread could not be opened directly (mirror returned 401); the points above are from search-result excerpts, without vote counts.
- No source was found documenting which commercial CRMs use a full Party model versus the simplified variant.

## 8. MDM practice: matching, survivorship, merge history

### Takeaway
MDM practice is exact-match rules on strong identifiers first, fuzzy/probabilistic scoring second, a review band for uncertain pairs, attribute-level survivorship, and a retained merge history so a wrong merge can be undone. The sources reached are vendor guides and study material, not standards.

### Cited Findings
- (excerpt) Deterministic matching uses explicit exact-match rules, giving high precision but lower recall; probabilistic matching weights attributes by uniqueness and reliability, raising recall and the risk of false positives — [CDMP study guide: Match-Merge & Identity Resolution](https://open-exam-prep.com/study-guides/cdmp/master-reference-data/match-merge-identity-resolution)
- (excerpt) Matches are scored against thresholds: above the automatic-merge threshold they merge, between the merge and non-match thresholds they "are marked for review by data stewards", below they are discarded — [State of New Mexico HSD: Master Data Management](https://webapp.hsd.state.nm.us/Procurement/docs/Other/Master%20Data%20Management%20(MDM)-v1-20200602_144544.pdf)
- (excerpt) Survivorship defines which attribute values survive from source records into the golden record; it should work at attribute level, not by picking one whole source record as the winner, and identity matching should be kept separate from attribute survivorship so a bad merge can be reversed and the golden record rebuilt — [CapMinds: MPI survivorship rules](https://www.capminds.com/blog/mpi-survivorship-rules-and-probabilistic-matching-strategies-for-enterprise-patient-identity-resolution/)
- (excerpt) Unmerge decomposes the golden record "back into its constituent source records without data loss"; keeping merge, split and unmerge history with provenance for every surviving attribute is recommended — [CapMinds: MPI survivorship rules](https://www.capminds.com/blog/mpi-survivorship-rules-and-probabilistic-matching-strategies-for-enterprise-patient-identity-resolution/)
- (excerpt, vendor) Traditional MDM is criticized for having no unmerge, the losing record being effectively discarded under strict survivorship — [Progress/MarkLogic: Rethinking MDM](https://www.progress.com/amp/rethinking-mdm-marklogics-smart-mastering-now-available/dWU5d09jQTFGZndVVnJod2xERzk5TENYb204PQ2)
- (excerpt) Without an exact anchor, fuzzy matching on names alone produces excessive false positives — [Xylity: MDM entity resolution](https://xylitytech.com/data-engineering/master-data-management-entity-resolution/)
- Product parallels: Apple's link model keeps source records and computes the unified view; Google keeps `sources[]` per field and `previousResourceNames` on the merged person — [iPad User Guide](https://support.apple.com/en-gu/guide/ipad/hide-duplicate-contacts-ipad70ccca56/15.0/ipados); [People API: Person](https://developers.google.com/people/api/rest/v1/people)

### Inferences
- For a single-office contact list, the scaled-down version is: canonical phone equality as the deterministic rule, shown as a suggestion at entry time ("this number already belongs to…") and in a review list; no automatic merge.
- Multi-valued fields make survivorship easy: phones, emails, groups and relation links are unioned, and only single-valued fields (display name, memo) need a rule or a user choice.
- In an ERP the main merge cost is re-pointing foreign keys (property ownership, requests, deals, contracts, call logs). Recording which contact was absorbed into which (the analogue of `previousResourceNames`) is the minimum that keeps a merge explainable and reversible.

### Gaps
- No analyst or standards-body source (e.g. DAMA-DMBOK text itself) was read; all MDM findings are from vendor, consultancy or study-guide pages surfaced by search and should be treated as general practice descriptions, not authoritative definitions.
- No source was found giving concrete threshold values or matching accuracy for name + phone matching on Korean names.
