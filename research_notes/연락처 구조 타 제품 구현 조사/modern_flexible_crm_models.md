# Modern flexible (Notion-like) CRMs: contact data model and contact screens

Research date: 2026-11-17. Products: Attio, Folk, Twenty, Notion, Airtable, Affinity, Clay (clay.earth).

Reading note on source quality:
- "(fetched)" = the page itself was read. "(search summary)" = the claim came from a search-result summary of that page and the page was not opened; treat wording as approximate.
- Coverage is uneven. Attio and Affinity are well documented and well covered here. Folk and Twenty are partly covered. Airtable and Clay (clay.earth) are thin: see the Gaps under each question.

## 1. Attio: objects, lists, records, attributes, record page

### Takeaway
Attio splits "what a person is" (a record of the People object, with object attributes) from "what we are doing with this person" (an entry in a list, with list attributes such as Stage and Owner). A person can sit in many lists, and even several times in the same list, and stage lives on the list entry, not on the person.

### Cited Findings

Data model
- Objects are "the data types used to store facts about your customer" (roughly tables); records are "an instantiation of an object, e.g. a specific person or a specific company" (roughly rows) — [Attio developer docs, Objects and lists (fetched)](https://docs.attio.com/docs/objects-and-lists)
- "Lists are composed of multiple rows, known as 'entries', each of which corresponds to a single record." "Entries are created by adding a record to a list." — [Attio developer docs, Objects and lists (fetched)](https://docs.attio.com/docs/objects-and-lists)
- "Attio comes with two objects enabled by default, people and companies." Three optional standard objects: deal, user, workspace — [Attio developer docs, Objects and lists (fetched)](https://docs.attio.com/docs/objects-and-lists)
- "both objects and lists can have their own attributes"; the docs give the example of a deals list with extra attributes "only relevant to a deal in that list" — [Attio developer docs, Objects and lists (fetched)](https://docs.attio.com/docs/objects-and-lists)
- Help center wording: "A list is a customizable grouping of records", and "even though the data is contained to this list, it's still connected to the underlying record." — [Attio help, Understanding Attio's data model (fetched)](https://attio.com/help/reference/attio-101/attios-data-model/understanding-attio-data-model)
- "Attributes in Attio are categorized into two types: object attributes and list attributes." In the help example of a customer onboarding list, `Owner` and `Stage` exist "only in this list", while `Description` and `Employee Range` are object attributes — [Attio help, Understanding Attio's data model (fetched)](https://attio.com/help/reference/attio-101/attios-data-model/understanding-attio-data-model)
- The same record can be added to one list more than once: "Multiple list entries are allowed for the same parent record." The entry has a `parent_record_id` ("The record will become the 'parent' of the created list entry"), a `parent_object`, and `entry_values` keyed by list attribute — [Attio API, Create an entry (fetched)](https://docs.attio.com/rest-api/endpoint-reference/entries/create-an-entry-add-record-to-list.md)

Attribute types and multi-value
- 17 attribute types: actor reference, checkbox, currency, date, domain, email address, interaction, location, (personal) name, number, phone number, rating, record reference, select, status, text, timestamp — [Attio developer docs, Attribute types (fetched)](https://docs.attio.com/docs/attribute-types)
- Multi-value is a flag on the attribute, not a separate type: `is_multiselect`, "whether you can write more than one value to this attribute" — [Attio developer docs, Attribute types (fetched)](https://docs.attio.com/docs/attribute-types)
- People default attributes: `email_addresses` (email address; unique, multiselect), `name` (personal name), `phone_numbers` (phone number; multiselect), `company` (record reference), `description`, `job_title`, `primary_location` (location), social handles as text (`linkedin`, `twitter`, `facebook`, `instagram`, `angellist`), `associated_deals` and `associated_users` (record references, present only if those objects are activated) — [Attio developer docs, Standard objects: People (fetched)](https://docs.attio.com/docs/standard-objects/standard-objects-people.md)
- Email addresses are the only attribute on People marked unique — [Attio developer docs, Standard objects: People (fetched)](https://docs.attio.com/docs/standard-objects/standard-objects-people.md)
- For a person, "a related company record will automatically be generated or matched based on the domain of the person's email address"; enriched attribute values "cannot be overridden by API users" — [Attio developer docs, Standard objects: People (fetched)](https://docs.attio.com/docs/standard-objects/standard-objects-people.md)

Status / stage
- Status attributes are "a constrained input type, where the user must pick from a predefined list", like select — [Attio developer docs, Status attribute type (fetched)](https://docs.attio.com/docs/attribute-types/attribute-types-status.md)
- The status type was "originally designed for use in Lists", the UI uses it to define kanban board columns, and it "can also be used with objects directly" — [Attio developer docs, Status attribute type (fetched)](https://docs.attio.com/docs/attribute-types/attribute-types-status.md)
- "All status attributes are single-select." "There's only one predefined status attribute, available on the deal object as `stage`." Writing an unknown status returns an error rather than creating one. Filtering supports an `active_from` date, i.e. when the status was entered — [Attio developer docs, Status attribute type (fetched)](https://docs.attio.com/docs/attribute-types/attribute-types-status.md)
- People and Companies have no predefined status attribute (the only predefined one is the deal `stage`) — [Attio developer docs, Status attribute type (fetched)](https://docs.attio.com/docs/attribute-types/attribute-types-status.md)

Record page
- Tabs per object: Overview, Activity, Notes, Tasks, Emails, Files; tabs can be added, reordered or removed, some defaults cannot be removed. Relationship tabs show linked records in a table — [Attio help, Configure record pages (fetched)](https://attio.com/help/reference/managing-your-data/records/configure-record-pages)
- Overview: "you can display up to six attributes as highlight widgets", added with "+ Add widget" — [Attio help, Configure record pages (fetched)](https://attio.com/help/reference/managing-your-data/records/configure-record-pages)
- Default highlights are Connection strength, Last email interaction and Last interaction — [Attio help, Configure record pages (search summary)](https://attio.com/help/reference/managing-your-data/records/configure-record-pages)
- Side sections: "Each record page must include a Record Details section." If no attributes are chosen it shows the first five object attributes. The Lists section cannot be removed and shows one section per list the record belongs to; "Each list section displays the first three list attributes" — [Attio help, Configure record pages (fetched)](https://attio.com/help/reference/managing-your-data/records/configure-record-pages)
- "Configuration settings are specific to each object." Changes apply to the whole workspace; only admins and members with Full access to the object can edit the layout — [Attio help, Configure record pages (fetched)](https://attio.com/help/reference/managing-your-data/records/configure-record-pages)
- List attribute changes (for example Stage = Won) appear in the record's Lists section and in its activity feed — [Attio help, Understanding Attio's data model (fetched)](https://attio.com/help/reference/attio-101/attios-data-model/understanding-attio-data-model)
- Activity is a timeline covering calendar events, notes, attribute updates, list additions and upcoming tasks — [Attio help, Create and view records (search summary)](https://attio.com/help/reference/managing-your-data/records/create-and-view-records)
- Redesign dated 2026-05-28: "Headline and actions are now top-left"; "The detail panel is now on the left"; sections are resizable by dragging; the full attribute list is searchable by name; comments open in a sidebar from the header; list cards switch between compact (more lists visible) and standard (edit in place); automation events in the activity timeline are collapsed by default — [Attio changelog, Record page redesign (fetched)](https://attio.com/changelog/2026/record-page-redesign)

### Inferences
- Attio's answer to "one overloaded status on the person" is structural: the person record carries no stage at all by default. Each process (sales, onboarding, hiring) is a list, and stage, owner and process-specific fields live on the list entry. The person page then shows a stack of list cards, one per membership, each with its own stage.
- "Multiple list entries for the same parent record" maps closely to this ERP's shape: one Contact with several BuyerIntake or ListingIntake rows over time. The Attio list entry is the analogue of an intake, not of the contact.
- The 2026 redesign moved attributes to the left and activity to the main area, which signals that Attio treats "who is this" as the first read and "what happened" as the working area.
- The record page being configurable per object (not per user) suggests a deliberate choice: one shared layout per record type for the whole workspace.

### Gaps
- The Attio list help article (`create-and-manage-lists`) returned 404, so list-view details (table versus kanban setup, filters, sort, group-by, bulk actions) are not confirmed from Attio's own pages here.
- The docs page for People did not list interaction attributes or connection strength as API attributes; they are confirmed only as default highlight widgets.
- Whether a custom attribute can be made unique for duplicate matching was not confirmed.
- Whether one list can mix records of more than one object was not confirmed.

## 2. Folk: groups, per-group fields, people vs companies, deals, pipeline

### Takeaway
Folk's unit of work is the group: a contact (person or company) exists once, can belong to zero, one or many groups, and each group carries its own custom fields. Pipeline columns come from a single-select field of the group, so status is effectively per group.

### Cited Findings
- "A group is a database made up of contacts (people & companies)." Groups "work as categories to organize different type of contacts to leverage them in different workflows." — [Folk developer docs, Groups (fetched)](https://developer.folk.app/core-concepts/groups.md)
- "A person/company can belong to zero, one or more groups, depending on your business needs." — [Folk developer docs, Groups (fetched)](https://developer.folk.app/core-concepts/groups.md)
- "You can create custom fields in each group to add and track the relevant data on your contacts." "Custom fields are proper to the group and are not shared across groups." "This way, you only track what matters regarding your current workflow." — [Folk developer docs, Groups (fetched)](https://developer.folk.app/core-concepts/groups.md)
- Group visibility has three levels: Private (default, owner only), Shared (owner and selected members), Shared with everyone — [Folk developer docs, Groups (fetched)](https://developer.folk.app/core-concepts/groups.md)
- In the API a person's `customFieldValues` object holds the custom fields grouped by group ID — [Folk developer docs, Custom fields (search summary)](https://developer.folk.app/core-concepts/custom-fields)
- Groups cannot be merged; the workaround is to add all contacts of group A to group B, or export and re-import. Duplicating a group copies its views and custom fields — [Folk help, FAQ database (search summary)](https://help.folk.app/en/articles/8174482-faq-database)
- Deals were added as an object next to People and Companies: "A deal can be linked to both people & companies, and the same deal can be linked to multiple people and/or companies. You can add multiple deals to the same contact." — [Folk help, Track deals (search summary)](https://help.folk.app/en/articles/9552366-track-deals)
- Deals are added as a "Deals" column from a people or company table view of a group; deal fields include select/multi-select (priority, status), dates, member (assignee), numbers (value) and text — [Folk help, Track deals (search summary)](https://help.folk.app/en/articles/9552366-track-deals)
- Pipeline view: "Group by" picks the custom field used for columns; if no single-select field exists yet, all contacts of the group land in a column named "No status". Card fields can be shown or hidden — [Folk help, Create custom pipeline views (search summary)](https://help.folk.app/en/articles/6044821-create-custom-pipeline-views)
- Duplicates: exact matches are auto-merged, other duplicates are flagged in a "Clean up duplicates" view — [Folk education, Use data intelligence (search summary)](https://education.folk.app/6-use-data-intelligence)
- Manual merge: select the duplicate contacts, click "Merge" in the quick actions bar, review the merge preview, confirm — [Folk help, Manage contacts data (search summary)](https://help.folk.app/en/collections/3538463-manage-contacts-data)

### Inferences
- Because custom fields are scoped to the group and the pipeline groups by one of those fields, a person can hold a different status in each group. A third-party review surfaced in search stated this directly ("Updating the custom status in either group does not make it a universal status for that person"), but I could not pin the statement to a specific URL, so it is listed here rather than as a cited finding.
- Folk and Attio converge on the same shape with different names: global contact + membership (group / list) + membership-scoped fields. Folk is the lighter variant: membership is at most once per group, and the "deal" object was added later for the case where one contact needs several concurrent pieces of business.
- Folk treats people and companies as two kinds of contact inside the same group, each with its own table view, rather than as fully separate modules.

### Gaps
- The layout of Folk's contact profile (interactions, notes, reminders sections) was not found in any source read.
- How field values are combined on merge, and what happens to group-specific fields on merge, is not documented in the sources found.
- The Track deals article was written in the beta period (it noted Zapier/Make could not create deals); current limits are unverified.
- Third-party claim that duplicate detection uses email and full name during import and form entry could not be traced to a primary source.

## 3. Twenty (open source): Person / Company / Opportunity, custom objects, relations

### Takeaway
Twenty uses a conventional object model (People, Companies, Opportunities, plus Notes and Tasks) with no list or membership layer; flexibility comes from custom objects, relation fields, many-to-many junction objects that the UI hides, and saved views.

### Cited Findings
- Standard objects: People (individuals such as contacts, leads, partners), Companies, Opportunities (deals), Notes (attached to records), Tasks (to-dos linked to records) — [Twenty docs, Data model overview (fetched)](https://docs.twenty.com/user-guide/data-model/overview.md)
- "You can also create custom objects for anything specific to your business (e.g., Projects, Subscriptions, Events)." — [Twenty docs, Data model overview (fetched)](https://docs.twenty.com/user-guide/data-model/overview.md)
- "Fields have different types: text, number, date, select, multi-select, relation, and more." — [Twenty docs, Data model overview (fetched)](https://docs.twenty.com/user-guide/data-model/overview.md)
- People, Companies and Opportunities are "the only objects where you can access synchronized emails and meetings from your mailbox/calendar." — [Twenty docs, Data model overview (fetched)](https://docs.twenty.com/user-guide/data-model/overview.md)
- The overview suggests separating kinds of people with views (for example one view for partners, another for prospects) rather than with separate objects — [Twenty docs, Data model overview (fetched)](https://docs.twenty.com/user-guide/data-model/overview.md)
- Standard relations: People to Companies many-to-one; Opportunities to Companies many-to-one; Opportunities to People many-to-one — [Twenty docs, Relation fields (fetched)](https://docs.twenty.com/user-guide/data-model/capabilities/relation-fields.md)
- A relation can point to several object types at once: a Note can attach to a Person, a Company and an Opportunity. "Relations pointing to multiple object types are not yet supported for CSV import/export." — [Twenty docs, Relation fields (fetched)](https://docs.twenty.com/user-guide/data-model/capabilities/relation-fields.md)
- Many-to-many uses a junction object, "an intermediate object that connects both sides"; with the junction relation setting, "Twenty displays the final linked records directly, hiding the intermediate object from the UI." — [Twenty docs, Relation fields (fetched)](https://docs.twenty.com/user-guide/data-model/capabilities/relation-fields.md)
- "Deleting relations removes the link but not the related records." — [Twenty docs, Relation fields (fetched)](https://docs.twenty.com/user-guide/data-model/capabilities/relation-fields.md)
- Standard objects cannot be deleted, only deactivated (hidden, data kept); labels can be renamed but API names are fixed — [Twenty docs, Data model FAQ (search summary)](https://docs.twenty.com/user-guide/data-model/how-tos/data-model-faq.md)
- Opening a Person or Company record shows information organized in tabs; Email and Calendar tabs show exchanges and meetings team members had with the contact once mailboxes are connected — [Twenty docs, Contact and account management (search summary)](https://docs.twenty.com/user-guide/crm-essentials/contact-and-account-management)
- "Twenty has a merge feature for both People and Companies", combining duplicates without losing information — [Twenty docs, Contact and account management (search summary)](https://docs.twenty.com/user-guide/crm-essentials/contact-and-account-management)

### Inferences
- Twenty's standard model gives an Opportunity exactly one person (many-to-one "point of contact"). Anything like "this deal has a seller, a buyer and a co-owner" needs a custom junction object. This is the place where this ERP's relation tables are already ahead of Twenty's defaults.
- The "hide the junction object in the UI" behaviour is a useful pattern: store role-bearing link rows, but show the user the linked record directly, with the role as a chip on the link.
- Twenty differentiates person types by saved view/filter, which only works when type is a field on the person. It has no built-in per-process stage on a person.

### Gaps
- Twenty's record side panel versus full page behaviour, its tab list (timeline, tasks, notes, files) and merge procedure were not confirmed: the Contact and account management page returned 404 when fetched directly, and the GitHub repository was not read.
- Whether emails and phones are multi-value field types in Twenty was not confirmed from a source read here.

## 4. Notion and Airtable CRM patterns: relations, rollups, roles, side peek

### Takeaway
Notion and Airtable have no contact model of their own; CRM templates are separate databases (Contacts, Companies, Deals/Opportunities, sometimes Interactions or Contracts) joined by relation or linked-record fields, with rollups for totals. Notion's table rows open in side peek by default.

### Cited Findings

Notion
- Opening a database page: "Side peek: Open pages on the right side of the database" (the view on the left stays usable); "Center peek: Open pages in a focused, center modal"; "Full page: Open pages as full pages directly." Table, Board, List and Timeline default to side peek; Gallery and Calendar default to center peek — [Notion help, Views, filters, sorts & groups (fetched)](https://www.notion.com/help/views-filters-and-sorts)
- View types: Table, Board, Timeline, Calendar, List, Gallery, Chart — [Notion help, Views, filters, sorts & groups (fetched)](https://www.notion.com/help/views-filters-and-sorts)
- Filters can be saved for everyone or kept personal; advanced filters combine AND/OR in groups nested up to three layers; multiple sorts apply in order; grouping by a property with optional sub-grouping, hide empty groups — [Notion help, Views, filters, sorts & groups (fetched)](https://www.notion.com/help/views-filters-and-sorts)
- "Relations between two different databases are created as one-way by default"; a two-way relation adds the reciprocal property on the other database — [Notion help, Relations & rollups (fetched)](https://www.notion.com/help/relations-and-rollups)
- A relation can be limited to `1 page` or `No limit` — [Notion help, Relations & rollups (fetched)](https://www.notion.com/help/relations-and-rollups)
- A database can relate to itself; with two-way enabled it creates a property per direction (for example Next task / Previous task) — [Notion help, Relations & rollups (fetched)](https://www.notion.com/help/relations-and-rollups)
- Relation display: property visibility `Always show`, `Hide when empty`, `Always hide`; you choose which properties of the linked pages appear inside the relation field — [Notion help, Relations & rollups (fetched)](https://www.notion.com/help/relations-and-rollups)
- "Rollups help you aggregate data in your databases based on relations." Calculations: show/count options (show unique values, count all, percent not empty), number options (sum, average, median, min, max, range), date options (earliest, latest, date range). Rollups sort only when numeric; a rollup of a rollup is not allowed — [Notion help, Relations & rollups (fetched)](https://www.notion.com/help/relations-and-rollups)
- Notion's own CRM build prompt uses four databases: Companies, Contacts, Opportunities, Contracts. Contacts link to Companies, Opportunities link to Contacts, Contracts link to Opportunities and Companies, each with a reciprocal property; Companies get a rollup "Won Deals Value"; an "Active Pipeline" board is grouped by Stage on Opportunities — [Notion, AI use case: build comprehensive workspaces (search summary)](https://www.notion.com/product/ai/use-cases/build-comprehensive-workspaces-across-clients-or-teams)

Airtable
- Airtable's Sales CRM template manages accounts, contacts, interactions and opportunities in one base — [Airtable template, Sales CRM (search summary)](https://www.airtable.com/templates/sales-crm/expaRDyCNa7YNZQoO)
- In that template Accounts do not link directly to Interactions; only Opportunities and Contacts do, so an account does not appear on an interaction unless reached through a contact or opportunity. A user raised this as a problem — [Airtable community thread (search summary)](https://community.airtable.com/other-questions-13/sales-crm-template-not-able-to-see-the-account-potential-customer-in-interactions-44954)

### Inferences
- In both template families, Stage sits on the Opportunity/Deal database, not on Contacts. The contact stays a plain reference record (name, company, contact details) and gets its "status" only through what it is linked to.
- Templates express role by which relation property the person sits in (for example an Opportunity's "Contact" field), not by a role field on the person. Notion's self-relation with a property per direction is the generic form of a contact-to-contact relation with named directions (spouse of, agent for).
- Notion's rule "you choose which properties of linked pages appear inside the relation field" is the convention behind relation chips that show a second attribute (stage, price) next to the name.
- The Airtable forum complaint shows the cost of an indirect link: if interactions hang only off the deal or the person, users still expect to see them from the company. A record page should aggregate activity across its linked records.

### Gaps
- Airtable linked-record, lookup, rollup field behaviour and the expand-record view were not confirmed from Airtable's own help pages in this pass.
- No official Notion template was read that models roles (owner, buyer) explicitly; the finding above is from Notion's AI build prompt.

## 5. Affinity and Clay: lists as the unit of work, enrichment, relationship strength

### Takeaway
Affinity makes the list the working surface and explicitly separates global fields (travel with the person or organization) from list-specific fields (exist only in that list), with a third class of enriched, read-only fields. Clay (clay.earth) could not be documented reliably in this pass.

### Cited Findings

Affinity
- Three list types: people lists (example: "Recruiting Pipeline - Track applicants in a recruiting pipeline and see what stage they're in"), organization lists (Dealflow, Portfolio Companies) and opportunity lists (LPs, Fundraising); lists of custom object records are in limited release — [Affinity support, Types of lists in Affinity (fetched)](https://support.affinity.co/s/article/Types-of-lists-in-Affinity.md)
- Opportunity lists are "Used to track a combination of people and organizations under one opportunity." "Each opportunity must have a unique opportunity name, no duplicate names allowed." — [Affinity support, Types of lists in Affinity (fetched)](https://support.affinity.co/s/article/Types-of-lists-in-Affinity.md)
- "Global fields will appear across all lists of the same list type." People and organization lists support both global and list-specific fields; opportunity lists support only list-specific fields because "opportunities are unique" — [Affinity support, Types of lists in Affinity (fetched)](https://support.affinity.co/s/article/Types-of-lists-in-Affinity.md)
- Notes and reminders are global on people and organization lists but list-specific on opportunity lists, and do not pass to the linked people or organizations — [Affinity support, Types of lists in Affinity (fetched)](https://support.affinity.co/s/article/Types-of-lists-in-Affinity.md)
- In an opportunity list, the organization's enriched and global fields are shown but people's enriched and global fields "will not show up in opportunity lists" — [Affinity support, Types of lists in Affinity (fetched)](https://support.affinity.co/s/article/Types-of-lists-in-Affinity.md)
- Field colour coding in list columns: green = enriched (auto-populated, cannot be created or deleted), blue = global (manually created, available across all lists of the same type), black = list-specific (manually created, only in this list) — [Affinity support, Enriched, Global and List-specific Fields (search summary)](https://support.affinity.co/s/article/Enriched-Global-and-List-specific-Fields)
- "List-specific fields are scoped to a single List. In the API, their data can only be accessed through the List Entry resource." — [Affinity developer docs, Working with field data (search summary)](https://developer.affinity.co/pages/data-model/working-with-field-data.md)
- Relationship intelligence fields are populated from users' email and calendar data (for example first and last email dates); enriched and relationship-intelligence fields do not track change history — [Affinity developer docs, Working with field data (search summary)](https://developer.affinity.co/pages/data-model/working-with-field-data.md)
- "Relationship Score" and "Connection Strength" are fields that can be added as columns to a saved list view — [Affinity support, How to customize saved views in your lists (search summary)](https://support.affinity.co/s/article/How-to-customize-saved-views-in-your-lists)

Clay
- Clay.earth (personal relationship manager) and Clay.com (B2B data-enrichment product) are separate companies; most search results for "Clay CRM enrichment" describe Clay.com — [use-apify.com, Clay personal CRM review 2026 (search summary)](https://use-apify.com/blog/clay-personal-crm-review-2026)
- A March 2026 third-party research note describes Clay.earth as a personal CRM / personal relationship manager, and says it uses email headers only and does not read email bodies — [Solanasis research handoff, 2026-03-18 (search summary)](https://solanasis-docs.pages.dev/playbooks/misc/solanasis-clay-earth-vs-clay-com-crm-enrichment-research-playbook-handoff-2026-03-18)
- One 2026 review says the personal CRM was renamed Mesh (me.sh) in 2024. Single source, not verified against the vendor — [use-apify.com, Clay personal CRM review 2026 (search summary)](https://use-apify.com/blog/clay-personal-crm-review-2026)

### Inferences
- Affinity's three field scopes (enriched / global / list-specific) are the clearest stated rule for "where does this field belong": if it is true of the person regardless of context it is global; if it only means something inside one process it is list-specific; if the system derives it, it is read-only and visually marked.
- Affinity's opportunity is a separate thing that groups people and organizations, with its own notes that do not leak onto the people. That is the same separation this ERP already has between Contact and Deal/BrokerageCase.
- Showing relationship strength and last-contact as ordinary sortable columns turns "who have we neglected" into a list filter rather than a status the user must maintain.

### Gaps
- No reliable primary source was found for Clay.earth / Mesh: its data model (people, groups, notes, reminders), enrichment sources, and merge behaviour are undocumented in this pass. Treat everything about Clay as low confidence.
- How Affinity calculates Relationship Score / Connection Strength was not found.
- Whether an Affinity entity can be on the same list more than once in normal use was not stated in the list-types article (the merge article shows it can happen after a merge; see section 9).

## 6. Is role/type a property of the person or of membership? Avoiding one overloaded status

### Takeaway
In the list-based products (Attio, Folk, Affinity) stage and process-specific fields belong to the membership (list entry / group), not to the person; in the object-based ones (Twenty, Notion and Airtable templates) stage belongs to the deal/opportunity record the person is linked to. In none of the sources read is a pipeline stage a default field on the person.

### Cited Findings
- Attio: the only predefined status attribute is `stage` on the deal object; the status type was "originally designed for use in Lists" — [Attio developer docs, Status attribute type (fetched)](https://docs.attio.com/docs/attribute-types/attribute-types-status.md)
- Attio: `Owner` and `Stage` in the onboarding example exist "only in this list" — [Attio help, Understanding Attio's data model (fetched)](https://attio.com/help/reference/attio-101/attios-data-model/understanding-attio-data-model)
- Attio: "Multiple list entries are allowed for the same parent record." — [Attio API, Create an entry (fetched)](https://docs.attio.com/rest-api/endpoint-reference/entries/create-an-entry-add-record-to-list.md)
- Folk: "Custom fields are proper to the group and are not shared across groups." — [Folk developer docs, Groups (fetched)](https://developer.folk.app/core-concepts/groups.md)
- Folk: pipeline columns come from a single-select field of the group; without one, contacts fall into "No status" — [Folk help, Create custom pipeline views (search summary)](https://help.folk.app/en/articles/6044821-create-custom-pipeline-views)
- Affinity: global fields "appear across all lists of the same list type", while opportunity lists allow only list-specific fields — [Affinity support, Types of lists in Affinity (fetched)](https://support.affinity.co/s/article/Types-of-lists-in-Affinity.md)
- Twenty: the docs suggest separate views for partners and prospects on the People object; standard relations put the person on the Opportunity (many-to-one) — [Twenty docs, Data model overview (fetched)](https://docs.twenty.com/user-guide/data-model/overview.md); [Twenty docs, Relation fields (fetched)](https://docs.twenty.com/user-guide/data-model/capabilities/relation-fields.md)
- Notion's CRM build prompt puts Stage on Opportunities (board grouped by Stage) and links Opportunities to Contacts — [Notion, AI use case (search summary)](https://www.notion.com/product/ai/use-cases/build-comprehensive-workspaces-across-clients-or-teams)

### Inferences
- Two families, same principle. (a) Membership family: person + list entry with its own stage. (b) Linked-record family: person + deal/opportunity with its own stage. Both keep the person free of process state. This ERP's current model (roles through relation tables to properties, buyer requests, deals, contracts) is already family (b).
- Given that, the owner's sense of "ambiguity" is unlikely to be a missing field on Contact. The products above resolve the same feeling on the screen: the person page shows every membership/linked record as a card with its own stage (Attio's unremovable Lists section), and the list screen shows derived columns (last interaction, lists/deals the person is in).
- What these products do keep on the person: identity (name), multi-value contact points (emails, phones), one primary organization, free-form classification (tags/select the user owns), and system-derived facts (last interaction, connection strength). A coarse "type" as a user-owned multi-select or as saved views is the Twenty pattern; it is a label for filtering, not a workflow state.
- A practical rule distilled from Affinity's three scopes: a field goes on the person only if it stays true when every deal and request is deleted.
- Derived role chips are consistent with all of these models: "owner", "buyer", "tenant" can be computed from relations and shown as read-only chips in the list and header, the same way Affinity marks enriched fields as system-populated.

### Gaps
- No source read states the design rationale in the vendors' own words (for example an Attio or Folk engineering post on why stage is not on the person). The conclusion is drawn from documented structure.
- User criticism of the list/membership model (for example confusion between object attributes and list attributes) was not collected; Reddit, Hacker News and G2 were not searched in this pass.

## 7. List screen conventions

### Takeaway
The shared convention is a database-style table with saved views (table and board), filter/sort/group controls, typed columns, and row open into a side panel; board columns are driven by a single-select or status field. Confirmed detail is strongest for Notion; Attio and Folk list-view specifics are only partly confirmed.

### Cited Findings
- Notion: views are Table, Board, Timeline, Calendar, List, Gallery, Chart; "Tables allow you to see your database pages as rows, with every property represented by a column"; boards group items by a property — [Notion help, Views, filters, sorts & groups (fetched)](https://www.notion.com/help/views-filters-and-sorts)
- Notion: table rows open in side peek by default, with the table still usable on the left — [Notion help, Views, filters, sorts & groups (fetched)](https://www.notion.com/help/views-filters-and-sorts)
- Notion: filters can be shared with the view or personal; nested AND/OR filter groups up to three levels; multiple ordered sorts; grouping and sub-grouping; hide empty groups — [Notion help, Views, filters, sorts & groups (fetched)](https://www.notion.com/help/views-filters-and-sorts)
- Notion: select and multi-select sort by the option order the user defines, not alphabetically — [Notion help, Views, filters, sorts & groups (fetched)](https://www.notion.com/help/views-filters-and-sorts)
- Attio: the status attribute defines the columns of a kanban board in the UI — [Attio developer docs, Status attribute type (fetched)](https://docs.attio.com/docs/attribute-types/attribute-types-status.md)
- Attio: column types available include select, status, record reference, actor reference, interaction, rating, currency, location, timestamp — [Attio developer docs, Attribute types (fetched)](https://docs.attio.com/docs/attribute-types)
- Folk: a group has table views for people and for companies, plus pipeline views created from "+ Create new view" in the group header; a Deals column is added from the "+" column — [Folk help, Track deals (search summary)](https://help.folk.app/en/articles/9552366-track-deals)
- Folk: bulk merge is offered from a quick actions bar after selecting contacts — [Folk help, Manage contacts data (search summary)](https://help.folk.app/en/collections/3538463-manage-contacts-data)
- Affinity: saved views per list with chosen columns, including relationship columns such as Relationship Score and Connection Strength; columns are colour-coded by field scope — [Affinity support, How to customize saved views in your lists (search summary)](https://support.affinity.co/s/article/How-to-customize-saved-views-in-your-lists); [Affinity support, Enriched, Global and List-specific Fields (search summary)](https://support.affinity.co/s/article/Enriched-Global-and-List-specific-Fields)

### Inferences
- Column vocabulary common to these products, useful for a contacts table: name (primary, opens the record), multi-value contact points shown as first value plus count, relation chips (company, deals, lists), select/multi-select chips, owner/assignee (actor), and system-derived date columns (last interaction, next task).
- Derived "last interaction" style columns are how these tools make the contacts list useful without a status field: the sort order answers "who needs attention".
- A selection-triggered action bar (Folk's quick actions bar) is the usual home of merge, add-to-group/list and delete.
- Board view only makes sense where a stage exists, so it appears on lists/groups/deals, not on the bare people table.

### Gaps
- Inline cell editing, row-open behaviour, bulk actions and group-by in Attio's and Twenty's table views were not confirmed from primary pages (Attio list help 404; Twenty page 404).
- Airtable's grid, grouping and expand-record conventions were not read.
- Linear-style conventions (command menu, keyboard shortcuts, display options popover) were not researched; the only confirmed shortcut is Attio's "n" to create a note — [Attio help, note templates (search summary)](https://attio.com/help/reference/tips-and-tricks/note-templates).

## 8. Record screen conventions

### Takeaway
The common record layout is a header with name and actions, a fixed attribute panel, a main area of tabs (overview, activity timeline, notes, tasks, emails, files), and a section showing each list/pipeline the record is in. Attio's 2026 version is the best-documented example.

### Cited Findings
- Attio tabs: Overview, Activity, Notes, Tasks, Emails, Files, plus relationship tabs that show linked records in a table; configurable per object — [Attio help, Configure record pages (fetched)](https://attio.com/help/reference/managing-your-data/records/configure-record-pages)
- Attio overview: up to six highlight widgets — [Attio help, Configure record pages (fetched)](https://attio.com/help/reference/managing-your-data/records/configure-record-pages)
- Attio: Record Details section is mandatory and shows the first five attributes if none are chosen; Lists section cannot be removed; each list card shows the first three list attributes — [Attio help, Configure record pages (fetched)](https://attio.com/help/reference/managing-your-data/records/configure-record-pages)
- Attio 2026-05-28 redesign: headline and actions top-left, detail panel on the left, resizable sections, searchable full attribute list, comments in a sidebar, compact versus standard list cards (standard allows editing in place), automation events collapsed in the timeline — [Attio changelog, Record page redesign (fetched)](https://attio.com/changelog/2026/record-page-redesign)
- Attio activity timeline includes calendar events, notes, attribute updates, list additions and upcoming tasks — [Attio help, Create and view records (search summary)](https://attio.com/help/reference/managing-your-data/records/create-and-view-records)
- Twenty: Person and Company records are organized in tabs; Email and Calendar tabs fill automatically from connected mailboxes — [Twenty docs, Contact and account management (search summary)](https://docs.twenty.com/user-guide/crm-essentials/contact-and-account-management)
- Twenty: Notes and Tasks are standard objects that attach to People, Companies and Opportunities through a multi-target relation — [Twenty docs, Relation fields (fetched)](https://docs.twenty.com/user-guide/data-model/capabilities/relation-fields.md)
- Notion: a record is a page; it opens in side peek, center peek or full page, and relation properties can show chosen properties of the linked pages — [Notion help, Views, filters, sorts & groups (fetched)](https://www.notion.com/help/views-filters-and-sorts); [Notion help, Relations & rollups (fetched)](https://www.notion.com/help/relations-and-rollups)
- Affinity: on people and organization records notes and reminders are global; on opportunities they stay with the opportunity — [Affinity support, Types of lists in Affinity (fetched)](https://support.affinity.co/s/article/Types-of-lists-in-Affinity.md)

### Inferences
- A workable contact record for a side-peek panel, following these conventions: header (name, derived role chips, primary actions such as call/note), a short key-properties block (about five fields, as Attio defaults to), a "memberships" block with one card per linked piece of work (each with its own stage and two or three fields, editable in place), then tabs or stacked sections for activity, notes, tasks, files.
- Attio making the Lists section non-removable is the strongest signal of where the "what is this person to us" answer is expected to be read: from the memberships, in a fixed place on the page.
- Noise control matters in timelines: Attio collapses automation events by default.
- Notes scope is a deliberate decision in these tools (Affinity: person notes are global, opportunity notes stay on the opportunity). A contact timeline can aggregate both but should label the origin.

### Gaps
- Folk's contact profile layout and Twenty's record page / side panel layout were not confirmed from primary sources.
- No screenshots were examined; layout statements are from text descriptions.

## 9. Duplicate detection and merge

### Takeaway
Detection keys are contact points (email for people, domain for companies), merge is pairwise with a designated primary record whose single-value fields win while multi-value fields and history are combined, and list-specific data is kept per entry. Undo exists only in Affinity's admin flow.

### Cited Findings

Attio
- `email_addresses` is the only unique attribute on People — [Attio developer docs, Standard objects: People (fetched)](https://docs.attio.com/docs/standard-objects/standard-objects-people.md)
- Attio prompts to merge duplicates it detects "using domain for companies and email address for people"; merge is started from a record page (Merge Records), for any two company or person records; the order can be swapped and the record on the right is merged into and prioritized — [Attio help, Merge and delete records (search summary)](https://attio.com/help/reference/managing-your-data/records/merge-and-delete-records)
- In the API merge, when both records hold a value for the same attribute the primary record's value takes precedence — [Attio API, Merge two records (search summary)](https://docs.attio.com/rest-api/endpoint-reference/records/merge-two-records.md)
- Records of Deals, Workspaces, Users and custom objects cannot yet be merged — [Attio help, Merge and delete records (search summary)](https://attio.com/help/reference/managing-your-data/records/merge-and-delete-records)
- Attio may merge records automatically when they enrich to the same person without sharing an email; a deleted person may be recreated if you later email them or schedule a meeting — [Attio help, Merge and delete records (search summary)](https://attio.com/help/reference/managing-your-data/records/merge-and-delete-records)
- A third-party app listing states that Attio's native merge handles two records at a time and leaves the user to pick the winner; marketplace apps add cluster-level or scheduled scans — [Attio app listing, Dedupe (search summary)](https://attio.com/apps/dedupe)

Folk
- Exact matches are auto-merged; other candidates are flagged in a "Clean up duplicates" view — [Folk education, Use data intelligence (search summary)](https://education.folk.app/6-use-data-intelligence)
- Manual: select duplicates, "Merge" in the quick actions bar, review a merge preview, confirm — [Folk help, Manage contacts data (search summary)](https://help.folk.app/en/collections/3538463-manage-contacts-data)

Twenty
- A merge feature exists for People and Companies — [Twenty docs, Contact and account management (search summary)](https://docs.twenty.com/user-guide/crm-essentials/contact-and-account-management)

Affinity
- People: "Intelligent Matches" are "Based on email matching across 40+ data sources" (stated about 97% accuracy); "Name Matches" are lower accuracy. Organizations: Identical Domain, Domain Redirect, Name Matches — [Affinity support, How to merge duplicates (fetched)](https://support.affinity.co/s/article/How-to-merge-duplicates.md)
- Affinity "continuously scans for duplicate records"; suggestions appear in a Duplicate Management center (admins), with Merge, Manage (side-by-side comparison) or Remove from List per suggestion — [Affinity support, How to merge duplicates (fetched)](https://support.affinity.co/s/article/How-to-merge-duplicates.md)
- Any user can merge one pair from the primary profile via "Merge duplicate" — [Affinity support, How to merge duplicates (fetched)](https://support.affinity.co/s/article/How-to-merge-duplicates.md)
- Merge combines "notes, interactions, reminders, files, and global field values" onto the Primary; global single-value fields take the Primary's value; global multi-value fields are combined; list-specific field values "will remain the same for each list entry" — [Affinity support, How to merge duplicates (fetched)](https://support.affinity.co/s/article/How-to-merge-duplicates.md)
- If both records were on the same list, the merge leaves "duplicate list entries on that list"; the primary's activity timeline shows history from both — [Affinity support, How to merge duplicates (fetched)](https://support.affinity.co/s/article/How-to-merge-duplicates.md)
- "Merge All" is limited to high-confidence matches (Intelligent Matches, Identical Domain) and merges only the first matching pair; name-based suggestions need individual review — [Affinity support, How to merge duplicates (fetched)](https://support.affinity.co/s/article/How-to-merge-duplicates.md)
- "Merges made one by one from a profile cannot be undone"; merges made in Duplicate Management can be undone from the Merged tab. Opportunities cannot be merged. Most merges finish in about 2-3 minutes; large records "can take several hours" — [Affinity support, How to merge duplicates (fetched)](https://support.affinity.co/s/article/How-to-merge-duplicates.md)

### Inferences
- Common merge contract: (1) pick a primary; (2) single-value fields: primary wins; (3) multi-value fields (phones, emails, tags): union; (4) notes, activity, tasks, files: re-parented to the primary; (5) memberships / linked work: all kept, never collapsed automatically, even if that leaves two entries in one list.
- For a Korean brokerage, phone number is the natural detection key in place of email (these products key on email because they sync mailboxes). The same two-tier confidence applies: exact contact-point match is high confidence (prompt at creation, allow bulk merge), name-only match is low confidence (review one by one).
- Because merge is hard to undo in most of these products, the safer designs show a preview or side-by-side comparison before confirming (Folk preview, Affinity Manage).
- Detection at the moment of entry (prompt when a matching contact point is typed) plus a standing "clean up duplicates" view covers both prevention and repair.

### Gaps
- Attio's and Folk's exact merge rules for list/group memberships and group-specific fields were not found.
- Twenty's merge procedure and detection logic were not confirmed (page 404 on direct fetch).
- Notion and Airtable have no native contact merge covered in the sources read; nothing was confirmed about how their CRM templates handle duplicates.
- Clay (clay.earth) merge behaviour: no reliable source found.
