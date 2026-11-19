# Contact data models and contact screens in major general-purpose CRMs (Salesforce, HubSpot, Pipedrive; Zoho CRM and Dynamics 365 briefly) — state as of 2026

Reading notes for the report writer:

- Research date 2026-11-17. Every bullet under "Cited Findings" comes from a page fetched or a search result read in this session. Search-result summaries (not full page reads) are marked "(search summary)"; treat their exact wording as approximate.
- Two Salesforce object-reference pages (Contact, OpportunityContactRole) returned HTTP 403, so field-level facts about those two objects are in "Gaps", not in "Cited Findings".
- No Reddit threads were retrieved. Practitioner criticism comes from Salesforce Ben, MarTech, vendor blogs, and the HubSpot / Pipedrive / Adobe-Marketo community forums.

## 1. Core objects (Lead vs Contact vs Account/Company/Organization vs Person) and why they are split; Person Accounts; Lead conversion pain points

### Takeaway
All five products separate "the person" from "the organization", and the B2B-first ones (Salesforce, Zoho, Dynamics) add a third pre-qualification object (Lead) that is converted into Contact + Account (+ Opportunity/Deal). Salesforce's answer for individual customers is the Person Account (an Account with a hidden, system-managed Contact), which is irreversible once enabled and carries known side effects; the Lead object itself is the most criticized part of the Salesforce model.

### Cited Findings

**Salesforce — Lead / Contact / Account**
- The standard model runs Leads through conversion into Contact, Account and Opportunity records; practitioners describe the Lead-vs-Contact choice as an ongoing debate with no single right answer (search summary) — [Varicent](https://www.varicent.com/blog/how-to-think-about-leads-vs.-contacts-in-salesforce), [Salesforce Ben](https://www.salesforceben.com/salesforce-leads-vs-contacts-everything-you-need-to-know/)
- Lead conversion is one-way: "Once a Lead becomes a Contact, that's it — it's a one-way trip." The author (Eric Dates, 2025-01-27) argues the Lead object "creates more problems than it solves", tracks one person at a time and ignores buying committees, and leaves sales without a full view of account engagement — [MarTech](https://martech.org/how-the-salesforce-lead-object-broke-b2b-marketing-and-how-to-fix-it/)
- A contacts-only model makes reporting easier because everything is in one object; Varicent says this is what it sees most high-growth organizations use (vendor view, search summary) — [Varicent](https://www.varicent.com/blog/how-to-think-about-leads-vs.-contacts-in-salesforce)
- Arguments for keeping Leads: mixing unqualified and qualified people in one object makes valuable data harder to find; conversion signals "qualified" to both marketing and sales (search summary) — [CMSWire](https://www.cmswire.com/digital-marketing/are-the-days-of-salesforce-marketing-qualified-leads-over), [Concentrix](https://catalyst.concentrix.com/blog/2020/10/salesforce-leads-vs-contacts)
- Conversion-related operational problems: dedupe has to happen before conversion (in Classic, converted Leads cannot be merged with each other); conversion fails if required fields are not populated and the record stays a Lead (search summary) — [Default.com](https://www.default.com/post/lead-conversion-salesforce), [Marketo community](https://nation.marketo.com/t5/Product-Discussions/Best-Practices-for-Leads-Contacts-in-Salesforce/td-p/178763)

**Salesforce — Person Account vs Business Account**
- Person account record types exist for "users who sell to or do business with individuals. For example, a doctor, hairdresser, or real estate agent whose clients are individuals." — [Salesforce developer docs: Person Account Record Types](https://developer.salesforce.com/docs/atlas.en-us.api.meta/api/sforce_api_guidelines_personaccounts.htm)
- Each person account has a linked person contact: "You can modify a person contact but you can't create or delete a person contact. If you delete the account, the contact is also deleted." — [Salesforce developer docs](https://developer.salesforce.com/docs/atlas.en-us.api.meta/api/sforce_api_guidelines_personaccounts.htm)
- "Unlike business accounts, person accounts can't have direct relationships with contacts. However, you can use Contacts to Multiple Accounts to create indirect relationships between a person account and a contact." — [Salesforce developer docs](https://developer.salesforce.com/docs/atlas.en-us.api.meta/api/sforce_api_guidelines_personaccounts.htm)
- Person accounts can be merged only with other person accounts; field-level security on a person-account field is inherited from the matching Contact field; in Lightning, person accounts do not appear in Contact lookups' instant results — [Salesforce developer docs](https://developer.salesforce.com/docs/atlas.en-us.api.meta/api/sforce_api_guidelines_personaccounts.htm)
- Converting a business account to a person account requires exactly one contact per account and identical values in shared fields such as Owner and Currency — [Salesforce developer docs](https://developer.salesforce.com/docs/atlas.en-us.api.meta/api/sforce_api_guidelines_personaccounts.htm)
- Irreversible: "it is not possible to disable the feature once you start using them." Storage: "A Person Account record will actually count against your storage for both the Account and Contact object." — [Salesforce Ben](https://www.salesforceben.com/salesforce-person-accounts-pros-and-cons/)
- Benefits listed: one record for an individual, no "dummy" company accounts, leads without a company name convert straight to a Person Account, users work from the Accounts tab for both kinds — [Salesforce Ben](https://www.salesforceben.com/salesforce-person-accounts-pros-and-cons/)
- Limitations listed: Parent Account, View Hierarchy and Reports To are unavailable (a Person Account cannot look up to another Person Account); Contact-based automation does not fire, so logic must be built on Account; AppExchange support may be limited; converting back to Business Account + Contact is difficult (the last three are from reader comments and author replies) — [Salesforce Ben](https://www.salesforceben.com/salesforce-person-accounts-pros-and-cons/)

**HubSpot — Contact / Company (Lead is optional and separate)**
- Standard CRM objects are contacts, companies, deals and tickets; association labels can describe relationships between all of them — [HubSpot developer docs: associations schema](https://developers.hubspot.com/docs/api-reference/latest/crm/associations/associations-schema/guide)
- Qualification is a property on the contact (Lifecycle stage), not a separate object that is converted; see section 2 — [HubSpot KB: change lifecycle stages in bulk](https://knowledge.hubspot.com/records/change-record-lifecycle-stages-in-bulk)
- HubSpot also has a Leads pipeline (a community thread discusses a lead "being moved to its previous stage on Leads Pipeline") (search summary, title only) — [HubSpot community](https://community.hubspot.com/t/lead-being-moved-back-to-a-previous-stage/132759)

**Pipedrive — Person / Organization (plus Lead as a pre-deal item)**
- "A person is a contact, such as a customer you do deals with. Each person can belong to an organization." `org_id` holds a single organization ID, not a list — [Pipedrive API: Persons](https://developers.pipedrive.com/docs/api/v1/Persons)
- The contact sidebar lists "linked leads, deals, contacts and projects", i.e. in Pipedrive a Lead is an item linked to a person, not a kind of person — [Pipedrive KB: contact detail view](https://support.pipedrive.com/en/article/contact-detail-view)

**Zoho CRM — Leads / Contacts / Accounts / Deals**
- The de-duplication tool runs on Leads, Accounts, Contacts, Deals, Vendors and custom modules, confirming these as separate modules — [Zoho KB: De-duplicate records](https://help.zoho.com/portal/en/kb/crm-v2-1/manage-crm-data/duplication-management/articles/crm-v2-auto-merge-duplicates)
- A contact can be linked to only one account at a time; an account can have many contacts (third-party help article and community user report, search summary) — [ExtensionERP help](https://help.extensionerp.com/portal/en/kb/articles/how-to-associate-multiple-contacts-with-a-deal), [Zoho community](https://help.zoho.com/portal/es/community/topic/multiple-contacts-for-one-account?page=8)

**Dynamics 365 Sales — Lead / Contact / Account / Opportunity**
- Qualifying a lead creates or links an account and contact; with the improved duplicate experience on, a dialog "Account or Contact may already exist" lets the seller pick the existing record or create new ones anyway (search summary) — [Microsoft Learn: Lead management FAQs](https://learn.microsoft.com/en-gb/dynamics365/sales/faq-lead), [Microsoft Learn: Manage duplicate leads](https://learn.microsoft.com/en-us/dynamics365/sales/manage-duplicate-leads)

### Inferences
- The split exists for two different reasons that should not be conflated: (a) person vs organization is a real-world distinction; (b) Lead vs Contact is a workflow/ownership distinction (marketing-owned, unqualified vs sales-owned, qualified). HubSpot and Pipedrive model (b) as a property or a separate linked item rather than as a second kind of person record; Salesforce, Zoho and Dynamics model it as a second table that must be converted, which is where the duplicate and irreversibility complaints come from.
- For a brokerage whose customers are individuals, the "one person record, no forced company" shape (HubSpot contact without company, Pipedrive person without organization, Salesforce Person Account) is the relevant precedent. The ERP's single `Contact` per office already matches this shape; none of the surveyed products suggests adding a separate Lead table for individuals.
- Salesforce's Person Account shows the cost of retrofitting individuals into a company-first model: two records behind one, automation on the "wrong" object, and no person-to-person hierarchy fields.

### Gaps
- Official Salesforce Help "Considerations for Using Person Accounts" and the lead-conversion field-mapping docs were not fetched; the irreversibility and storage claims rest on Salesforce Ben only.
- HubSpot's separate Lead object (Sales Hub prospecting workspace) was only seen in a community thread title; its data structure and relation to the Contact's lifecycle stage were not verified.
- Whether Zoho still restricts a contact to one account in 2026 was not confirmed against a current Zoho help page.

## 2. How a person's ROLE is expressed (field on the contact, lifecycle stage, or role on the link); can one person hold several roles at once

### Takeaway
Every product ends up putting the role on the link between the person and something else (opportunity, account, deal), not on the person: Salesforce Opportunity Contact Roles and Account Contact Relationship roles, HubSpot association labels, Dynamics connection roles, Zoho deal contact roles; Pipedrive is the weakest (one primary person per deal plus unlabeled "participants"). The contact-level fields (HubSpot lifecycle stage, Pipedrive labels) describe funnel position or a tag, not the role in a given transaction.

### Cited Findings

**Salesforce**
- `AccountContactRelation` is a junction object recording a contact's relationship with one or more accounts (many-to-many). It has a `Roles` multi-select picklist (examples: Business User, Decision Maker, Economic Buyer, Executive Sponsor), `IsDirect` (whether this account is the contact's primary account), and `StartDate` / `EndDate` to keep relationship history (search summary of the object reference) — [Salesforce object reference: AccountContactRelation](https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_accountcontactrelation.htm)
- The feature is switched on under Account Settings ("Contacts to multiple Accounts"). The contact stays tied to its primary account as the "strong/real" relationship; the others are indirect (search summary) — [Salesforce Ben](https://www.salesforceben.com/salesforce-account-contact-relationship-fields-relate-a-contact-to-multiple-accounts/), [CloudKettle](https://www.cloudkettle.com/blog/linking-multiple-accounts-to-a-contact-in-salesforce/)
- Known limits: some features cannot reference indirect relationships (formulas) or only use the primary account (duplicate checks). Account-contact roles and opportunity contact roles are "two separate objects, each with their own setup, so any roles you add to one need to be added to the other" (search summary) — [Salesforce Ben](https://www.salesforceben.com/salesforce-account-contact-relationship-fields-relate-a-contact-to-multiple-accounts/)
- Lightning supports Contact Roles for Opportunities, Cases and Contracts, but not for Accounts (search summary) — [CloudKettle](https://www.cloudkettle.com/blog/linking-multiple-accounts-to-a-contact-in-salesforce/)

**HubSpot**
- Custom association labels "further define record associations", e.g. a "Decision maker" label on a contact-company association. Limit: up to 10 association labels per object pairing (e.g. contacts-companies, contacts-contacts) — [HubSpot developer docs: associations schema](https://developers.hubspot.com/docs/api-reference/latest/crm/associations/associations-schema/guide); one third-party source says 50, which conflicts — [Insycle](https://support.insycle.com/hc/en-us/articles/6585704504599)
- Labels can describe the relationship between any two standard objects, including contact-to-deal; multiple labels can be put on one association (community post and third-party guide, search summary) — [HubSpot community blog](https://community.hubspot.com/t5/HubSpot-Community-Blog/HubSpot-Associations-New-and-Improved/bc-p/543678), [Insycle](https://support.insycle.com/hc/en-us/articles/6585704504599)
- Labels are added when associating records ("+Add association label") or later from the association card's menu ("Edit association labels"), and can be set in bulk by import or workflow. Association labels require Professional or Enterprise; plain associations are on all plans — [HubSpot KB: associate records](https://knowledge.hubspot.com/records/associate-records)
- "Primary" is a built-in label for company associations. The first company associated to a contact becomes primary; only the primary company receives automatically associated timeline activities and lifecycle-stage sync, and is the one referenced by segments, workflows, cross-object reports and personalization tokens — [HubSpot KB: associate records](https://knowledge.hubspot.com/records/associate-records)
- Lifecycle stage is a contact/company property that by default only moves forward. Imports, forms, API and workflow "set property" actions can only set it forward; to move back you must clear the property first, then set the new value — [HubSpot KB: change lifecycle stages in bulk](https://knowledge.hubspot.com/records/change-record-lifecycle-stages-in-bulk), [HubSpot community](https://community.hubspot.com/t/contact-lifecycle-stages/103098)
- Community practitioners advise keeping lifecycle stage as "how far has this contact gotten" and tracking current status or disqualification in a separate property (search summary) — [HubSpot community](https://community.hubspot.com/t/contact-lifecycle-stages/103098)

**Pipedrive**
- "A deal can only have one linked contact person at a time"; additional people are added as participants from the deal's Participants section — [Pipedrive KB: Can multiple people be linked to a deal?](https://support.pipedrive.com/en/article/can-multiple-people-be-linked-to-a-deal)
- Deals have one linked person and one linked organization by default; to add more related people or organizations you create person/organization custom fields, each holding one contact — [Pipedrive KB: related people or organizations](https://support.pipedrive.com/article/how-can-i-add-related-people-or-organizations-to-a-deal)
- Persons carry `label_ids` (an array of label IDs), i.e. several labels per person — [Pipedrive API: Persons](https://developers.pipedrive.com/docs/api/v1/Persons). A community search summary states multi-label for persons/organizations came out of beta to all regions (source page not individually identified) — [Pipedrive community, contacts tag](https://community.pipedrive.com/discussions/tagged/contacts/p1)

**Zoho CRM**
- When several contacts are tied to a deal, they are stored in the deal's Contact Roles related list (API: `/crm/{version}/Deals/{deal_id}/Contact_Roles`) — [Zoho developer docs: Get Contact Roles](https://www.zoho.com/crm/developer/docs/api/v7/get-contact-roles.html)
- Zoho later announced a "Secondary Contacts" field on Deals to capture additional contacts; older posts describe one primary contact plus contact roles (sources differ on timing, search summary) — [Zoho community announcement](https://help.zoho.com/portal/en/community/topic/we-heard-you-you-can-now-associate-multiple-contacts-to-a-deal?page=2)

**Dynamics 365 Sales**
- Opportunity Stakeholders are connection records: the subgrid shows connections whose connection-role category is Stakeholder. Built-in roles: Champion, Decision Maker, End User, Economic Buyer, Influencer, Technical Buyer; the role is the "As this role" field on the connection. A contact entered in the opportunity's Contact field is added to Stakeholders automatically (search summary) — [Microsoft Learn: stakeholders and sales team members](https://learn.microsoft.com/en-us/dynamics365/sales/stakeholders-sales-team-members), [Microsoft Learn: add stakeholder](https://learn.microsoft.com/en-us/dynamics365/sales/add-stakeholder)
- Connection roles are admin-configured and grouped by category; sample categories include Business, Family and Social (older developer docs, search summary) — [Microsoft Learn: connection roles](https://learn.microsoft.com/it-it/dynamics365/customerengagement/on-premises/developer/describe-relationship-entities-connection-roles?view=op-9-1)

### Inferences
- Role-on-the-link is the industry norm, so the ERP's design (owner/buyer/tenant expressed through relation tables to properties, buyer requests, deals and contracts) is the mainstream pattern, not an oddity. One person holding several roles at once falls out naturally: a different link row (or several labels on one link) per role.
- What the big CRMs add on top, and what probably removes the "ambiguous" feeling, is a visible roll-up on the person: HubSpot shows associations (with labels) as cards on the contact record; Salesforce shows Related Accounts and opportunity roles as related lists; Dynamics shows connections. The role lives on the link but is always readable from the person's page.
- Contact-level classification still exists everywhere but answers a different question: funnel position (HubSpot lifecycle stage, forward-only) or free tagging (Pipedrive labels). HubSpot's forward-only rule and the community advice to keep "current status" in a separate property is the same principle the ERP follows (do not mix lifecycle and status in one field).
- The "primary" flag is a recurring device (Salesforce `IsDirect`, HubSpot Primary company, Pipedrive linked person vs participants, Zoho primary contact vs contact roles) and a recurring source of surprise, because automation and reports often look only at the primary.

### Gaps
- `OpportunityContactRole` field list (ContactId, OpportunityId, Role, IsPrimary) and default role picklist values could not be verified: the object-reference page returned 403. A search summary also claimed that adding an account to an opportunity adds all the account's contacts as contact roles; this was not verified and should not be relied on.
- HubSpot's single vs paired label distinction (e.g. Manager / Direct report) and the "Buying role" contact property were not covered by the pages read.
- Whether Pipedrive participants can carry a role label was not found; pages read describe participants only as an additional list.

## 3. Multiple phones/emails (fixed fields vs repeating labeled values); person-to-person relationships and households

### Takeaway
Pipedrive stores phones and emails as repeating labeled values with a primary flag (the closest match to the ERP's `ContactPhone` rows); HubSpot attaches extra emails to one contact (visible in merge behaviour); Salesforce's standard pattern could not be verified in this session. Person-to-person relationships are modeled as same-object links with a label/role (HubSpot contact-to-contact labels, Dynamics connections with Family/Social categories), and households in Salesforce are an Account that people are attached to through Account Contact Relationships.

### Cited Findings

**Phones / emails**
- Pipedrive `phones` and `emails` are arrays of objects, each with `value`, `primary` (boolean) and `label` (classification string) — [Pipedrive API: Persons](https://developers.pipedrive.com/docs/api/v1/Persons)
- Pipedrive's sidebar summary always shows label(s), email, phone and the linked organization/person — [Pipedrive KB: contact detail view](https://support.pipedrive.com/en/article/contact-detail-view)
- HubSpot: on merge "the secondary contact's email address is permanently associated with the primary contact", i.e. one contact can hold more than one email address (search summary) — [HubSpot KB: merge records](https://knowledge.hubspot.com/crm-setup/merge-records)
- Salesforce: a community post notes an object can appear only once in a matching rule, so one custom rule cannot compare several email fields on Contact — evidence that extra emails are separate fields, not a repeating list (search summary) — [Trailblazer community](https://trailhead.salesforce.com/trailblazer-community/feed/0D54S00000A8MhcSAF)

**Person-to-person relationships**
- HubSpot: records of the same object can be associated (contacts with contacts), with labels such as "colleagues", "manager", "advisor"; associations are two-way — [HubSpot KB: associate records](https://knowledge.hubspot.com/records/associate-records)
- Dynamics: connections with roles relate any two records; sample role categories include Family and Social (search summary) — [Microsoft Learn: connection roles](https://learn.microsoft.com/it-it/dynamics365/customerengagement/on-premises/developer/describe-relationship-entities-connection-roles?view=op-9-1)
- Salesforce Person Accounts lack Reports To / Parent Account because a Person Account cannot look up to another Person Account — [Salesforce Ben](https://www.salesforceben.com/salesforce-person-accounts-pros-and-cons/)
- Pipedrive: a person links to one organization; a Pipedrive team member acknowledged "a bit of a limitation with contacts" when a person belongs to several organizations (search summary) — [Pipedrive community](https://community.pipedrive.com/discussion/13264/handling-contacts-associated-with-multiple-orgs)

**Households (Salesforce industry clouds)**
- In Financial Services Cloud a household is represented by an account, and members are related to it with account-contact relationship records; admins can use either the Person Account model or the Individual model (search summary) — [Trailhead: Build households and groups](https://trailhead.salesforce.com/content/learn/modules/client-management-in-financial-services-cloud/build-households-and-groups)
- A person can be related to several households through Account Contact Relationships but only one is the primary group, and rollups use the primary group (third-party guide, search summary) — [Vantage Point](https://vantagepoint.io/docs/salesforce-fsc-households)
- Health Cloud's household model describes Account Contact Relationship as the junction between an account representing a household/organization and a person; Account-Account and Contact-Contact relationships cover the other pairings (search summary) — [Trailhead: household data model](https://trailhead.salesforce.com/it/content/learn/modules/health-cloud-data-models/take-a-look-at-the-household-data-model)

### Inferences
- Two storage patterns exist: fixed named fields (the classic Salesforce/Zoho/Dynamics style) and repeating labeled values with a primary flag (Pipedrive). The ERP's `ContactPhone` rows are the Pipedrive pattern; the surveyed evidence shows the fixed-field style causing dedupe-rule awkwardness (Salesforce matching rule limit).
- For households, Salesforce's approach is "a group record + member links with a primary flag", while HubSpot/Dynamics use direct person-to-person labeled links. The ERP's `ContactRelation` (spouse, agent) is the direct-link pattern; a household/group record is only needed if something must be rolled up per household.
- Person-to-person links in the general CRMs are generic labels with no domain meaning; none of them distinguishes, for example, a legal proxy from a family member in a way that affects a transaction.

### Gaps
- Salesforce Contact's phone/email fields (Phone, MobilePhone, HomePhone, OtherPhone, AssistantPhone, Email) and the `ReportsToId` field could not be confirmed: the Contact object-reference page returned 403.
- HubSpot's phone storage (separate Phone number / Mobile phone number properties) and the exact "additional email addresses" UI were not verified from a HubSpot page.
- Zoho and Dynamics phone/email field structures were not researched.
- Salesforce core Contact-to-Contact relationship objects outside the industry clouds were not found.

## 4. Duplicate detection and merge: keys, timing, merge mechanics

### Takeaway
Detection is rule-based and mostly "warn, don't block" at entry, plus a batch review queue; keys are name + email + phone (+ company), with fuzzy matching in Salesforce and Dynamics. Merge is always "pick a primary/master, choose field values, re-parent related records", is irreversible in HubSpot and Pipedrive, and is limited in arity (Salesforce 3 records, Dynamics 2).

### Cited Findings

**Salesforce**
- A matching rule defines how records are compared; a duplicate rule defines what happens on a match. The standard contact duplicate rule alerts the user but still allows the save; it can be set to Block on create. Standard matching rules cannot be edited; a custom matching rule is needed to change the compared fields (search summary) — [Trailhead: Duplicate Management](https://trailhead.salesforce.com/content/learn/modules/sales_admin_duplicate_management/sales_admin_duplicate_management_unit_1), [Salesforce Ben](https://salesforceben.com/salesforce-duplicate-rules/)
- The standard contact matching rule matches on algorithms tied to First Name, Last Name, Email, Account Name "and several other fields" (third-party help page, search summary; exact field list not confirmed against Salesforce docs) — [Cognism help](https://help.cognism.com/hc/en-gb/articles/6492362393234-Setting-up-Duplicate-and-Matching-Rules-in-Salesforce)
- "Up to three records can be merged in a single request, including the main record" — [Salesforce API: merge()](https://developer.salesforce.com/docs/atlas.en-us.api.meta/api/sforce_api_calls_merge.htm)
- With Contacts to Multiple Accounts, duplicate checks only use the primary account (search summary) — [Salesforce Ben](https://www.salesforceben.com/salesforce-account-contact-relationship-fields-relate-a-contact-to-multiple-accounts/)
- Person accounts merge only with person accounts — [Salesforce developer docs](https://developer.salesforce.com/docs/atlas.en-us.api.meta/api/sforce_api_guidelines_personaccounts.htm)

**HubSpot**
- The duplicates manager compares, by default for contacts: first name, last name, email, IP country, phone, zip code and company name; custom rules are available; pairs can be merged or rejected individually or in bulk; managing duplicates requires Professional or Enterprise (search summary) — [HubSpot KB: manage duplicate records](https://knowledge.hubspot.com/records/manage-duplicate-records)
- In a merge you choose which property values to keep from each record; bulk merge can use criteria such as "most recently updated" (search summary) — [HubSpot KB: manage duplicate records](https://knowledge.hubspot.com/records/manage-duplicate-records)
- On merge, cookies of both contacts go to the primary, the secondary's email is permanently associated with the primary, and the records are unenrolled from all workflows. "Once you've merged two records, it is not possible to unmerge them"; a "Merged [record] IDs" property shows previously merged records. Rejected duplicate pairs can be rolled back for 14 days (search summary) — [HubSpot KB: merge records](https://knowledge.hubspot.com/crm-setup/merge-records), [HubSpot KB: manage duplicate records](https://knowledge.hubspot.com/records/manage-duplicate-records)

**Pipedrive**
- Possible duplicates are listed under Tools and apps > Merge Duplicates, and also reachable from the detail view of a flagged person or organization. You choose the primary; on conflict the primary's value wins (the article's example is two different phone numbers: the primary's is kept). A Preview step shows the result. Merged items "can't be un-merged". Only admins or users with the permission can merge; regular users see only duplicates they have visibility for — [Pipedrive KB: Merge duplicates](https://support.pipedrive.com/en/article/merge-duplicates)
- Any two people/organizations/deals can also be merged manually from the detail view via "More (...)" > "Merge" — [Pipedrive KB: Merge duplicates](https://support.pipedrive.com/en/article/merge-duplicates)
- On import, after a person's name is recognized Pipedrive checks the linked organization, phone and email; if any of the three matches an existing person (or another row in the file) the rows are merged (search summary) — [Pipedrive KB: How does Pipedrive avoid duplicates](https://support.pipedrive.com/hc/no/articles/208048865-How-does-Pipedrive-avoid-duplicates-)
- API: `PUT /api/v1/persons/{id}/merge` with `merge_with_id`; the `merge_with_id` person is kept and its data takes priority on conflict — [Pipedrive API: Persons](https://developers.pipedrive.com/docs/api/v1/Persons)

**Zoho CRM**
- The de-duplicate tool lets an admin pick up to three fields to match on; the master record is chosen automatically by most recent activity and cannot be changed manually — [Zoho KB: De-duplicate records](https://help.zoho.com/portal/en/kb/crm-v2-1/manage-crm-data/duplication-management/articles/crm-v2-auto-merge-duplicates)
- A Duplicate Check Preference on Leads prevents creating duplicate leads, and can also check Leads against the Contacts module on a chosen unique field (search summary) — [Zoho community: Enhanced duplicate check for Leads](https://help.zoho.com/portal/en/community/topic/enhanced-duplicate-checking-for-leads-in-crm-6-6-2024?page=2), [Zoho KB: Checking duplicate records](https://help.zoho.com/portal/en/kb/crm-v2-1/manage-crm-data/duplication-management/articles/crm-v2-check-duplicate-records)

**Dynamics 365**
- Merge is available for account, contact and lead tables, two records at a time; the user can fill empty fields in the primary from the duplicate or switch which record is primary (search summary) — [Microsoft Learn: Merge duplicate rows](https://learn.microsoft.com/en-us/powerapps/user/merge-duplicate-records)
- Lead duplicate detection (Sales Enterprise/Premium, enabled by an admin) uses AI and fuzzy matching (search summary) — [Microsoft Learn: Manage duplicate leads](https://learn.microsoft.com/en-us/dynamics365/sales/manage-duplicate-leads)
- Vendor claim: native rules can flag that a Lead matches a Contact but will not merge across tables (vendor blog, unverified against Microsoft docs) — [Plauti](https://www.plauti.com/blog/how-to-find-duplicates-across-entities-in-dynamics-365)

### Inferences
- The common pattern is three layers: (1) a soft warning at create time on phone/email/name match, (2) a standing "possible duplicates" queue with merge/reject, (3) import-time matching. Hard blocking is opt-in almost everywhere.
- Products with a Lead table need cross-table duplicate handling (Zoho checks Leads against Contacts; Dynamics prompts at qualification); a single person table avoids this class of problem entirely.
- Merge always needs a "which value wins" decision. Pipedrive's "primary wins" example is for single values; with repeating phone rows the natural rule is union, but no page read confirmed how Pipedrive handles multi-value fields on merge.
- An audit trail of merges (HubSpot's "Merged record IDs") is the only mitigation offered for irreversibility.

### Gaps
- HubSpot's automatic deduplication of contacts by email address at creation/import was not confirmed from a page read in this session.
- Pipedrive's exact duplicate-detection criteria for the Merge Duplicates list (as opposed to import) are in a separate article that was not retrieved.
- What happens to linked deals, activities and notes on merge was not stated in the Pipedrive or Zoho pages read.
- The exact field list of Salesforce's standard contact matching rule was not confirmed from Salesforce documentation.

## 5. Contact list screen: default columns, saved views/filters, segments/lists, inline edit, bulk actions

### Takeaway
All products present contacts as a configurable table with user-chosen columns, saved filters/views that can be private or shared, and select-rows-then-bulk-edit. HubSpot separates "views" (table presets on the index page) from "segments" (lists used by automation and marketing); Pipedrive keeps it to filters + column picker + bulk edit.

### Cited Findings

**HubSpot**
- Index pages offer default views and custom saved views built from filters, with visibility set to private or account-wide; filters are applied immediately but only persist after a refresh if the view is saved (search summary) — [HubSpot KB: create and manage saved views](https://knowledge.hubspot.com/records/create-and-manage-saved-views), [HubSpot KB: view and filter records](https://knowledge.hubspot.com/records/view-and-filter-records)
- Segments are distinct from views, and some filter operators behave differently between the two ("contains exactly" in views vs "contains any of" in segments) (search summary) — [HubSpot KB: view and filter records](https://knowledge.hubspot.com/records/view-and-filter-records)
- Columns: chosen from properties or associations (legacy page: column editor at the table's right edge; updated page: part of the view's configuration). Associated records can be shown inline in the table for review and edit; bulk edit is available from the table (search summary) — [HubSpot KB: view and filter records in the updated index page](https://knowledge.hubspot.com/records/view-and-filter-records-in-the-updated-index-page)
- Two index-page versions are documented in 2026: a legacy one and an "updated index page" that applies to Free and Starter accounts created after 2026-03-30 (search summary) — [HubSpot KB: view and filter records in the updated index page](https://knowledge.hubspot.com/records/view-and-filter-records-in-the-updated-index-page)

**Pipedrive**
- The list view supports add, delete, edit, filter, sort and bulk edit; the People list has a "+ Person" button. Filters open from a dropdown at the top right; every list has owner filters. Columns are toggled with a gear icon at the right. Hovering a person shows a card with name, email, phone and linked organization (search summary) — [Pipedrive KB: List view](https://support.pipedrive.com/en/article/list-view)
- Bulk edit: select several rows to open the bulk-edit panel, choose a field, "Edit current value", set the new value and confirm; group email can be sent to selected rows (search summary) — [Pipedrive KB: Bulk-editing and filtering](https://support.pipedrive.com/hc/en/articles/206529689)

**Salesforce**
- In list views and related lists, a per-row dropdown offers Edit (search summary; list-view inline edit and mass actions were not covered by the pages returned) — [Trailhead: Work with your data](https://trailhead.salesforce.com/content/learn/modules/lightning-experience-for-salesforce-classic-users/work-with-your-data)

### Inferences
- The shared structure is: one table, a view switcher (saved filter + column set + sort), a filter bar, a column picker, row selection with a bulk-action bar, and a quick preview on hover or in a side panel. This matches the Notion-style list pattern the ERP already uses on other list screens.
- HubSpot's view/segment split is a marketing-automation concern (segments feed workflows and emails); for an internal brokerage tool a saved view is the relevant concept, and `ContactGroup` plays the role of a static list.
- Showing association columns (e.g. linked company, linked deals) directly in the contact table is how HubSpot exposes link-based roles on the list without storing them on the contact.

### Gaps
- Default column sets for contacts in each product were not found in the pages read.
- Salesforce list views (pinned lists, inline edit conditions, mass actions, Kanban/split view) were not retrieved from an official page.
- Zoho and Dynamics contact list screens were not researched.
- Whether HubSpot allows inline editing of a contact's own property cells in the table was not explicitly confirmed (only inline editing of associated records was mentioned).

## 6. Contact detail screen layout: panes, associated records, logging notes/calls/tasks

### Takeaway
The dominant layout is three zones: identity and key fields (header or left), an activity timeline in the middle with composer actions for note/call/email/task, and associated records as cards or related lists on the right. In 2026 HubSpot is moving to a two-column "updated" layout (header + tabbed workspace + right sidebar with Key information / Associations / Attachments); Pipedrive puts the field sidebar on the left and splits the main area into Focus (upcoming) and History (past).

### Cited Findings

**HubSpot — classic layout**
- A record has three areas: left sidebar, middle column, right sidebar. Left: action icons (log activity, follow) and a property card ("About this contact"); contacts also get Communication subscriptions and Website activity cards. Middle: the activity timeline (logged activities, stage changes, form submissions, analytics events), with tabs including an overview of associations and important properties plus custom tabs. Right: associations shown as preview cards per object (Companies, Deals, Tickets) and attachments (search summary) — [HubSpot KB: work with records](https://knowledge.hubspot.com/records/work-with-records)
- Customizing the right sidebar requires Professional or Enterprise — [HubSpot KB: associate records](https://knowledge.hubspot.com/records/associate-records)

**HubSpot — updated layout (page last updated 2026-09-25)**
- "The default views for contacts, companies, deals, and tickets use an updated record default layout" that opens in two columns with three areas: page header, main workspace, right sidebar — [HubSpot KB: understand the default record layout](https://knowledge.hubspot.com/records/understand-the-default-record-layout)
- Header: up to five displayed properties (set by admins), avatar, two activity buttons plus an activity menu, Actions menu, record tag, pagination arrows, breadcrumbs — [HubSpot KB: understand the default record layout](https://knowledge.hubspot.com/records/understand-the-default-record-layout)
- Main workspace tabs: Overview (AI-generated Summary and Health sections), Activities (timeline with quick filters such as Emails and Notes, plus All activities), Revenue (Quote-to-cash, e-Commerce, Signals, lifetime value), Intelligence (for contacts: data enrichment, associated company details, outreach data) — [HubSpot KB: understand the default record layout](https://knowledge.hubspot.com/records/understand-the-default-record-layout)
- Right sidebar tabs: Key information / "About this [object]" (editable properties), Associations (previews of associated records), Attachments — [HubSpot KB: understand the default record layout](https://knowledge.hubspot.com/records/understand-the-default-record-layout)
- Availability is stated inconsistently: the same page says the layout requires opting in to the "Universal record page" private beta, while a search summary of another HubSpot page says Professional and Enterprise accounts get the updated layout automatically from mid-April 2026 — [HubSpot KB: understand the default record layout](https://knowledge.hubspot.com/records/understand-the-default-record-layout); [HubSpot KB: work with records](https://knowledge.hubspot.com/records/work-with-records)

**Pipedrive**
- Left sidebar: Summary (labels, email, phone, linked organization or person; fixed, cannot be moved), Details (chosen default and custom fields), Overview (activities and which users interacted), and linked items (leads, deals, contacts, projects, plus marketing status and campaign data). Sections can be hidden and reordered per user — [Pipedrive KB: contact detail view](https://support.pipedrive.com/en/article/contact-detail-view), [Pipedrive KB: detail view sidebar](https://support.pipedrive.com/en/article/detail-view-sidebar)
- Action panel: write notes, create activities, call (integrated caller), send email (email sync), upload files, create documents — [Pipedrive KB: contact detail view](https://support.pipedrive.com/en/article/contact-detail-view)
- Main area: Focus (upcoming activities, email drafts, pinned notes; collapsible) above History (all past updates in filterable sections, including a Changelog of field changes with date and user) — [Pipedrive KB: contact detail view](https://support.pipedrive.com/en/article/contact-detail-view)
- Followers are managed from a dropdown at the top; a pencil icon on a sidebar section opens editing for all its fields at once (search summary for the second point) — [Pipedrive KB: contact detail view](https://support.pipedrive.com/en/article/contact-detail-view), [Pipedrive KB: detail view sidebar](https://support.pipedrive.com/en/article/detail-view-sidebar)
- The redesigned contact detail view added a summary panel at the top of the sidebar, independent scrolling for sidebar and main area, and collapsible sections (search summary) — [Pipedrive blog](https://www.pipedrive.com/en/blog/contact-detail-view)

**Salesforce Lightning**
- The highlights panel at the top of a record shows key fields and is configured by the compact layout, not the page layout editor (sources differ on six vs seven fields). Related lists are components on the record page and must also be on the user's page layout. The activity timeline tracks meetings, tasks, calls and emails (search summary) — [Trailhead: compact layouts](https://trailhead.salesforce.com/content/learn/modules/lex_customization/lex_customization_compact_layouts), [Trailhead: Lightning App Builder record page](https://trailhead.salesforce.com/content/learn/modules/lightning_app_builder/lightning_app_builder_recordpage), [Trailhead: what's new in Lightning](https://trailhead.salesforce.com/content/learn/modules/lex_migration_whatsnew/lex_migration_whatsnew_crm)

**Dynamics 365**
- On the Opportunity form, Stakeholders and Sales team are subgrids of connection records; a "New Connection" action adds a contact with a role (search summary) — [Microsoft Learn: add stakeholder](https://learn.microsoft.com/en-us/dynamics365/sales/add-stakeholder)

### Inferences
- The stable division of labour across products: "who is this" (identity, phones, emails, tags) pinned and always visible; "what happened / what is next" as the scrolling centre; "what is this person connected to" as a column of per-object cards. Pipedrive's Focus/History split (future above past) is a distinct and compact pattern for the centre.
- Associated-record cards are where link-based roles become visible: each card lists the linked deals/companies and, in HubSpot, the association label. For the ERP the equivalent would be per-kind cards on the contact (properties owned, listings entrusted, buyer requests, deals, contracts) each showing the role the person holds on that link.
- Logging is done from the person's page but stored as its own record tied to the timeline (note, call, email, task); none of the products stores interaction history as fields on the contact.
- HubSpot's 2026 direction (properties moved to a right-hand tab, AI summary first) shows the layout is not settled even among leaders; the three-zone structure is the safer reference.

### Gaps
- Salesforce's default Contact record page arrangement (Details / Related / Activity tab placement) was not confirmed from an official page; only component-level facts were found.
- The HubSpot updated-layout rollout status is contradictory between two HubSpot pages; which tiers see it by default in late 2026 is unresolved.
- Zoho contact detail layout was not researched.
- No screenshots were examined; all layout descriptions come from help-article text.

## 7. What practitioners criticize about each model

### Takeaway
Salesforce is criticized for too many objects for one human (Lead vs Contact vs Person Account), irreversible structural choices, and role data that sales reps do not maintain; HubSpot for forward-only lifecycle stage, "primary company" side effects and tier-gated labels and dedupe; Pipedrive for being too flat (one organization per person, one person and one organization per deal).

### Cited Findings

**Salesforce**
- Lead object: one-way conversion, individual-centric, "creates more problems than it solves" — [MarTech](https://martech.org/how-the-salesforce-lead-object-broke-b2b-marketing-and-how-to-fix-it/)
- Person Accounts: cannot be disabled once enabled; double storage; Contact automation does not fire; limited third-party app support; hard to convert back; readers report a poor fit when one person relates to several accounts — [Salesforce Ben](https://www.salesforceben.com/salesforce-person-accounts-pros-and-cons/)
- Opportunity Contact Roles go unfilled: a consultancy blog says sales "rarely takes the time" to enter them; Traction Complete calls it "unnecessary admin work" to fill "a flat list of names and roles that will never be revisited"; a Marketo community user says emphasis on it "didn't stick for long", another calls enforcement on large teams "a nightmare". Workaround: a validation rule blocking Closed Won without at least one contact role (search summary) — [Traction Complete](https://tractioncomplete.com/?p=11769), [Adobe/Marketo community](https://experienceleaguecommunities.adobe.com/adobe-marketo-engage-27/why-sales-needs-to-use-contact-roles-165612), [Salesforce Ben](https://www.salesforceben.com/4-ways-to-create-salesforce-contact-roles-and-get-accurate-campaign-influence-reporting/)
- Duplicate contact roles: an automation created the same contact twice on one opportunity under different role records (search summary) — [Gong community](https://visioneers.gong.io/integrations-77/duplicate-contact-roles-on-opportunities-in-salesforce-933)
- Role picklists must be maintained twice (account-contact roles and opportunity contact roles are separate objects); indirect account relationships are invisible to formulas and duplicate checks (search summary) — [Salesforce Ben](https://www.salesforceben.com/salesforce-account-contact-relationship-fields-relate-a-contact-to-multiple-accounts/)

**HubSpot**
- Lifecycle stage cannot be moved backward without first clearing it; users have a long-running Ideas thread asking for backward movement, and moving back clears the later "Became a [stage] date" values (search summary) — [HubSpot Ideas](https://community.hubspot.com/t5/HubSpot-Ideas/Ability-to-move-Lifecycle-Stage-backwards/m-p/15759), [HubSpot community](https://community.hubspot.com/t/contact-lifecycle-stages/103098)
- Only the primary company gets auto-associated activities, lifecycle sync and is used by segments, workflows and reports — a structural limit for people tied to several companies — [HubSpot KB: associate records](https://knowledge.hubspot.com/records/associate-records)
- Association labels and the duplicates manager are gated to Professional/Enterprise; merges cannot be undone — [HubSpot KB: associate records](https://knowledge.hubspot.com/records/associate-records), [HubSpot KB: manage duplicate records](https://knowledge.hubspot.com/records/manage-duplicate-records)

**Pipedrive**
- One linked person and one linked organization per deal; users have asked for multiple organizations per deal ("there is currently no way to track these companies on Pipedrive next to the deal, only 1 company or multiple people") (search summary) — [Pipedrive community](https://community.pipedrive.com/discussion/8424/linking-multiple-organizations-to-a-deal)
- Participants are "in a separate list and can't easily be cc'ed"; automatic email linking to all deal participants has been requested for years (search summary) — [Pipedrive community](https://community.pipedrive.com/discussion/comment/44568), [Pipedrive community, contacts tag](https://community.pipedrive.com/discussions/tagged/contacts/p1)
- A person can belong to only one organization; the suggested workaround is to link a deal to a person and an organization that are not linked to each other (search summary) — [Pipedrive community](https://community.pipedrive.com/discussion/13264/handling-contacts-associated-with-multiple-orgs)

**Zoho / Dynamics**
- Zoho: one account per contact; a custom-lookup workaround does not surface those contacts in the account's email "To" field (community report, search summary) — [Zoho community](https://help.zoho.com/portal/es/community/topic/multiple-contacts-for-one-account?page=8)
- Zoho: the de-duplication master record is chosen automatically and cannot be overridden — [Zoho KB: De-duplicate records](https://help.zoho.com/portal/en/kb/crm-v2-1/manage-crm-data/duplication-management/articles/crm-v2-auto-merge-duplicates)
- Dynamics: when a contact changes jobs reps often create a new record instead of updating the relationship, producing duplicates (vendor blog, search summary) — [Inogic](https://www.inogic.com/blog/?p=46565)

### Inferences
- The criticisms cluster into three failure modes that are directly relevant to the ERP owner's "ambiguous" complaint:
  1. More than one record type for a human (Lead/Contact/Person Account) leads to duplicates and irreversible conversions. The ERP does not have this problem.
  2. Role data on a link that users must enter separately decays, because entering it is extra work with no immediate payoff (Salesforce contact roles). The mitigation seen in the wild is to make the role a by-product of the main workflow or to enforce it at a stage gate. In the ERP the role links are already by-products of registering a property, intake, deal or contract, which is the stronger position.
  3. A model that is too flat (Pipedrive's single linked person/organization) forces workarounds once several parties are involved in one transaction, which is the normal case in real-estate deals.
- The likely source of perceived ambiguity in a role-on-link model is not the storage but the read side: if the contact list and contact page do not summarise "what is this person to us" from the links, users experience the contact as an undifferentiated name. Every surveyed product compensates with association cards/related lists on the person and, in HubSpot, association columns in the list.
- "Primary" flags are a recurring source of hidden behaviour; if the ERP introduces one (primary phone, primary owner), what it controls should be made explicit.

### Gaps
- No Reddit threads (r/salesforce, r/hubspot, r/CRM) were retrieved; the search returned vendor blogs and vendor community forums instead. Criticism of HubSpot association labels specifically (beyond tier gating and label limits) was not found.
- Several criticisms come from vendors selling fixes (Traction Complete, Plauti, Inogic, Varicent, Insycle) and should be weighted accordingly.
- No quantitative data (duplicate rates, contact-role fill rates) was found.
