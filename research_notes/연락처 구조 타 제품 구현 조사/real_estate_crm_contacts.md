# Real-estate CRMs outside Korea: contact data structure and contact screens (as of Nov 2026)

Products covered: Follow Up Boss (FUB), BoldTrail/kvCORE, Lofty (Chime), Wise Agent, LionDesk, Top Producer, Propertybase, Rex, AgentBox / Reapit Sales (AU), VaultRE, Reapit (UK, Foundations), Alto, Street.co.uk.

Reading notes on source quality:
- "(fetched)" = I read the page itself. "(snippet)" = the page returned HTTP 403 or a login wall to the fetcher (all Zendesk-hosted help centres: help.followupboss.com, support.rexsoftware.com, support.vaultre.com.au, help.lofty.com, help.propertybase.com; plus Reapit's AU help and Confluence wiki), so the finding rests on the search engine's extract of that page. Wording in snippets is close to the original but was not verified in full context.
- Two families emerge and are referred to throughout: **US lead-centric CRMs** (FUB, BoldTrail, Lofty, Wise Agent, LionDesk, Top Producer) and **AU/UK agency CRMs** (Rex, AgentBox/Reapit Sales, VaultRE, Reapit, Alto, Street) where one office handles vendors, buyers, landlords and tenants.

## 1. One unified contact record or separate Lead/Contact/Owner/Tenant entities? How is "type" expressed, and can one contact hold several types?

### Takeaway
Every product examined keeps one person/contact record; none splits a person into separate Owner and Buyer tables. They differ in where the "type" lives: US products put a multi-valued type or tag on the person (Buyer, Seller, ...), while Reapit and Street put the type on a separate role record (applicant, vendor, landlord, tenancy) that points back at the central contact, and AgentBox/Reapit Sales assign stackable "classes" that the system adds automatically when a listing or lease event happens.

### Cited Findings
- **Reapit (UK, Foundations)**: "Contact: A person the agent has a relationship with"; details are stored centrally so "a single contact can fulfill multiple vendor, landlord, applicant and tenancy roles at the same time." Applicant, Vendor, Landlord and Tenancy are separate entities, each referencing "one or more contacts or companies." (fetched) — [Reapit Foundations platform glossary](https://foundations-documentation.reapit.cloud/platform-glossary)
- **Reapit**: an Applicant "represents the buying or renting interests of one or more contacts or companies," holding requirements such as room count, maximum budget and areas of interest; a Vendor is linked to a single property and is created automatically when a property with sales marketing is added; a Landlord can have multiple properties; a Property is associated with a single vendor and/or landlord entity. (fetched) — [Reapit Foundations platform glossary](https://foundations-documentation.reapit.cloud/platform-glossary)
- **Reapit**: Company is a separate entity from Contact, with types such as solicitor or supplier, and can take part in transactions. (fetched) — [Reapit Foundations platform glossary](https://foundations-documentation.reapit.cloud/platform-glossary)
- **Street.co.uk**: the data model was built so that "a person only exists once, but can also be an applicant, a vendor, a landlord, or a tenant." (snippet, trade-press interview) — [The Negotiator](https://thenegotiator.co.uk/features/fast-flexible-and-feedback-driven-how-street-group-is-rewriting-the-rules-of-agency-tech/)
- **Street.co.uk**: roles are shown as "persona pills" next to the person's name: VN Vendor, SA Sales Applicant, LL Landlord, LA Lettings Applicant, TT Tenant, PC Point of Contact. "A person only gets a pill for a role they currently hold." The applicant pill for the other side appears only "where that other applicant record is still actively looking." (fetched) — [Street help: Persona pills](https://intercom.help/streetcouk/en/articles/16554380-persona-pills)
- **AgentBox / Reapit Sales (AU)**: "A contact can be assigned to as many of Reapit Sales's contact categories e.g. Vendor, Buyer, Tenant, Landlord as required." Classes are assigned by rule or manually; when a listing is converted the contact keeps its prospect class and gains the vendor or landlord class; marking a lease as leased adds a tenant class to the assigned tenant. Agencies can also create custom contact classes. (snippet; page is behind login) — [Reapit Sales help: Life Cycle of a Contact](https://beta.help.reapit.com.au/sales/getting-started/Life-Cycle-of-a-Contact)
- **AgentBox**: "A contact can have more than one role, but will always share the same central contact record"; "A contact may have multiple properties, each with a different role/status." (snippet) — [Reapit wiki: Agentbox contact panel](https://reapit.atlassian.net/wiki/spaces/RW/pages/672497665/Agentbox+contact+panel+APAC+only)
- **VaultRE**: contacts carry categories, exposed in the API as `GET /categories/contact` and `/contacts/{id}/categories` (a list per contact). (snippet of API listing) — [apis.io VaultRE API](https://apis.io/apis/vaultre/vaultre-api/)
- **BoldTrail/kvCORE**: five lead types (Buyer, Seller, Renter, Vendor, Agent); "Each contact in your Smart CRM can have more than one lead type as necessary." Lead type is separate from status: "Lead types refer to the type of contact that you are working with regardless of where they are in the buying/selling process." Import uses `buyer|seller`. (snippet) — [BoldTrail Lead Types Overview](https://help.insiderealestate.com/en/articles/4626537-boldtrail-lead-types-overview)
- **Lofty**: the API stores `leadTypes` as an int array, so a lead can carry several: Seller (1), Buyer (2), Renter (5), Investor (6), Agent (7), Homeowner (8), Landlord (9), Other (-1). (fetched) — [Lofty developer docs: Leads](https://developer.lofty.com/concepts/leads.md)
- **Lofty**: the UI has a combined "Buyer & Seller" type; merging a "Seller" lead with a non-seller lead produces "Buyer & Seller." (snippet) — [Lofty help: Duplicate Leads / Merging](https://help.lofty.com/hc/en-us/articles/360054872172-Duplicate-Leads-Merging-Duplicates)
- **Follow Up Boss**: there is no buyer/seller type field on the Person. The API docs say lead type is inferred from tags: "there will be a "Seller" tag initially set when the lead is created," otherwise the lead is treated as a buyer. Person fields are stage, source, tags, emails[], phones[], addresses[], assignedTo, collaborators, price, custom fields. (fetched) — [FUB API: List people](https://docs.followupboss.com/reference/people-get)
- **Follow Up Boss**: the help centre recommends tags on top of stages for grouping; "Buyer, Seller, Renter, etc. make great tags." (snippet) — [FUB help: Changing a Lead Stage](https://help.followupboss.com/hc/en-us/articles/360012456793-Changing-a-Lead-Stage)
- **Wise Agent**: a contact has one Status (place in the transaction process, only one at a time) but can be in many Categories; plus an A–F Rank. (snippet) — [Wise Agent blog: Contact Management System](https://wiseagent.com/blog/wise-agents-contact-management-system-find-hidden-gems-in-your-crm)
- **Top Producer (8i)**: "you can also apply multiple contact types to the same contact." (snippet) — [Top Producer 8i: Contact Types](https://support.topproducer.com/top-producer/contacts/contact-types/)
- **Propertybase (Salesforce)**: uses the Salesforce Contact; because Salesforce requires an account for every contact, Propertybase creates a "hidden" account for every individual contact in the background. Buying interest is a separate related object (Inquiry) on the Contact. (snippet) — [Propertybase help: Managing Contacts](https://help.propertybase.com/hc/en-us/articles/203187413); [Propertybase help: Inquiry Management](https://help.propertybase.com/hc/en-us/articles/360005051331)

### Inferences
- Three distinct ways of expressing type appear: (a) free tags (FUB), (b) a multi-select type/class on the person (BoldTrail, Lofty, Top Producer, Wise Agent categories, VaultRE categories, AgentBox classes), (c) no type on the person at all, with the type being the existence of a role record pointing at the person (Reapit, Street, Propertybase Inquiry). The Korean app's current model (roles via PropertyContact, BuyerIntakeContact, Deal, ContractParty) is variant (c).
- Products in variant (c) still surface a derived badge on the person so users see roles at a glance (Street's pills; AgentBox's auto-assigned classes behave like a stored version of the same thing). The badge is computed from live role records and disappears when the role ends (Street's "currently hold" rule).
- No product examined models Owner and Buyer as separate person tables; "Lead" in US products is the same record as "contact", distinguished only by stage.

### Gaps
- Alto: its features page lists "Single contact records" but I found no document describing how applicant/vendor/landlord/tenant roles attach to it. [Alto product features](https://altosoftware.co.uk/product-features)
- VaultRE: the official list of contact categories and whether they are system-assigned or manual could not be read (support site returns 403). A third-party profile says a contact can be buyer, seller, tenant and landlord simultaneously, but that is not VaultRE documentation. [village.ai profile](https://village.ai/company/vaultre)
- LionDesk: no usable source found on its contact type model.
- Rex: whether Rex has a contact "type" field beyond relationships and tags was not confirmed.

## 2. How a contact is linked to properties (ownership, tenancy, vendor on a listing, buyer requirements, enquirer) and whether the role is stored on the link

### Takeaway
The AU/UK products store the role on the link between a contact and a property or listing, and keep buyer requirements as their own record separate from the person. US products mostly have no property-ownership link at all; a person is linked to a deal, and the property is an address on the person or the deal.

### Cited Findings
- **Rex**: contact-to-property and contact-to-listing links carry a relationship type, and agencies can define custom relationship categories (example given: Power of Attorney) and set what happens on listed/sold/leased: "When a contact is a properties Owner, when listed, they will be converted to the Listing Owner." (snippet) — [Rex: custom relationship categories](https://www.rexsoftware.com/updates/create-your-own-custom-relationship-categories); [Rex help: Custom Relationship Types](https://support.rexsoftware.com/hc/en-us/articles/360041587353-Custom-Relationship-Types)
- **Rex**: historic relationship status is retained on the contact ("past ownership, landlord status, tenant status etc."), described as "a single-point of reference for the entire history of your relationship with a Contact." (snippet) — [Rex: Contact Management](https://www.rexsoftware.com/feature/contact-management)
- **VaultRE**: a property requires an owner to be attached; the owner can be an existing contact or a new one, and the same applies to landlords, purchasers and tenants. Multiple owners can be attached to one property. A separate article covers attaching a property to an existing contact to avoid duplicates. (snippet) — [VaultRE help: Add a property to an existing contact](https://support.vaultre.com.au/hc/en-au/articles/360004179656-Add-a-property-to-an-existing-contact); [VaultRE help](https://support.vaultre.com.au/hc/en-au/articles/13986633164047)
- **VaultRE**: "if the contact is a potential buyer or tenant, you can add a buy or rent requirement"; there is also a "Buyer/Tenant Requirement" note type. (snippet) — [VaultRE help: adding a contact](https://support.vaultre.com.au/hc/en-au/articles/6407222511631); [Harcourts Vault notes](https://harcourtsintl.freshdesk.com/support/solutions/articles/35000256736-notes)
- **Reapit**: requirements live on the Applicant record, not on the Contact; Offer is "an applicant's submitted offer to purchase a property"; Enquiry is a pre-record lead (valuation or viewing request) that is "vetted by the agent before being promoted into property or applicant records." (fetched) — [Reapit Foundations platform glossary](https://foundations-documentation.reapit.cloud/platform-glossary)
- **Street.co.uk**: applicant preferences (location, price range, property type, bedrooms) are "captured and stored when the record is created"; hovering a persona pill shows that role's context, e.g. the VN card shows what the person is selling and the TT card shows their tenancy. (fetched) — [Street: Applicant registration & matching](https://street.co.uk/product/index/applicant-registration-matching); [Street help: Persona pills](https://intercom.help/streetcouk/en/articles/16554380-persona-pills)
- **Propertybase**: "Contact Roles allow you to specify a specific relationship between a Contact and a Listing record." Inquiry is a related object on Contact; a "Linked Listing" record stores the contact's feedback on a specific property, "permanently related to the current Inquiry and Contact." Listings are always based on a Property record. (snippet) — [Propertybase help: Using Contact Roles](https://help.propertybase.com/hc/en-us/articles/115002570691-Using-Contact-Roles); [Propertybase help: Inquiry Management](https://help.propertybase.com/hc/en-us/articles/360005051331); [Propertybase help: Listing Management](https://help.propertybase.com/hc/en-us/articles/360005560211)
- **Follow Up Boss**: a Deal links to people through `peopleIds` ("A list of person ids that should be part of this deal") and to staff through `userIds`, with `stageId`, `price` and commission fields. The create-deal reference shows no role per person on the deal. (fetched) — [FUB API: Create deal](https://docs.followupboss.com/reference/deals-post)
- **BoldTrail**: the contact's Personal Information modal has Primary Address, Valuation and Home Preferences sections; properties appear only through Valuation (adding an address starts a recurring seller valuation email). Transactions are linked DocuSign/Dotloop/Skyslope records. (fetched) — [BoldTrail Contact Record Overview](https://help.insiderealestate.com/en/articles/4619572-boldtrail-contact-record-overview)
- **Lofty**: transactions "are created and associated with the lead" at the conversion stage. (fetched) — [Lofty developer docs: Leads](https://developer.lofty.com/concepts/leads.md)

### Inferences
- In the AU/UK products the link row is the place the role lives (owner, tenant, listing owner, plus custom ones like power of attorney), and Rex converts the role as the property moves through listing and sale rather than asking users to re-enter it. This matches the Korean app's PropertyContact table; the difference is that Rex/VaultRE show all such links on the contact in one "related properties" area with the role label and keep past links visible.
- Buyer requirements are consistently a child record (Reapit Applicant, Street applicant record, Propertybase Inquiry, VaultRE requirement), not fields on the person, which allows one person to have several requirements and allows several people to share one.
- US products do not model "this person owns unit X" as a link to a property master, because they have no property master; this makes them a weak reference for owner-side structure.

### Gaps
- Rex "match profile" (buyer criteria) documentation was not retrievable; I could not confirm its fields or whether a contact can have several.
- No source confirmed how inspection/open-home attendees or enquirers are linked to a contact in Rex, VaultRE or AgentBox.
- FUB Deal: whether the UI shows a per-person role on a deal was not confirmed; the API reference shows none.

## 3. Households, joint owners, couples; multiple phones and emails

### Takeaway
There are three competing designs for couples, and vendors have moved between them: (1) one record holding several names with each phone/email tagged to a person (Rex), (2) a primary person with dependent "relationship"/"family member" sub-entries that are not full contacts (FUB, Lofty, BoldTrail spouse field, Wise Agent spouse fields), and (3) separate full contacts joined by a relationship or by sharing a role record (Top Producer X, Reapit, Reapit Sales AU). Top Producer explicitly migrated from design 2 to design 3.

### Cited Findings
- **Rex**: "Some contacts in Rex represent more than one person — such as couples, co-owners, or business partners." Each email address and phone number can be linked to a specific person within the shared record, and names can be reordered. Rex's FAQ advises: "It's a good idea to add partners into the same record. This is so they merge correctly when sending letters/emails etc. For example a husband and wife can share one Contact Record." (snippet) — [Rex help: Managing Multi-Name Contact Records](https://support.rexsoftware.com/hc/en-us/articles/55488136142105-Managing-Multi-Name-Contact-Records); [Rex help: Contacts FAQ](https://support.rexsoftware.com/hc/en-us/articles/7682303756953-Contacts-FAQ)
- **Rex**: separately, contacts can be related to other contacts and to company records; opening a contact shows "all of that Contact's related people or Properties." (snippet) — [Rex help: Introduction to the Contacts Module](https://support.rexsoftware.com/hc/en-us/articles/360025447433-Introduction-to-the-Contacts-Module)
- **Follow Up Boss**: Relationships are entered in a section on the lead's profile: "This is where you can add contact info for any people who are related to your lead." "All your communication with related people stays organized together on the same lead profile," with each name labelled in-line; related people can be added to group texts/emails and invited to appointments. (fetched) — [FUB updates: Contact Relationships](https://updates.followupboss.com/en/better-together-contact-relationships-)
- **Follow Up Boss**: the help centre says to use relationships for people "you want to follow up with as a unit" and states: "We do not recommend using the contact relationship feature to track additional contacts such as vendors, the referring agent, or title company." (snippet) — [FUB help: Contact Relationships](https://help.followupboss.com/hc/en-us/articles/1500008593181)
- **Follow Up Boss**: relationships are exposed in the API as a field on the person (`fields=relationships`) and a `/v1/peopleRelationships` resource; before the feature, "many of our customers add the spouse's email address and an additional email on the same contact." (fetched / snippet) — [FUB API: List people](https://docs.followupboss.com/reference/people-get); [FUB blog: January 2019 product update](https://www.followupboss.com/blog/january-2019-product-update)
- **Follow Up Boss**: emails[] carry value, type, isPrimary, status; phones[] carry type, value, status. (fetched) — [FUB API: List people](https://docs.followupboss.com/reference/people-get)
- **Lofty**: up to four "family members" per lead; their contact details appear in the call/text/email options; communication with a family member is logged on the primary lead's profile; mass emails go only to the primary lead. When a duplicate is flagged the merge menu offers "Merge as Duplicates" or "Merge as Family Members." (snippet) — [Lofty help: Managing Family Members](https://help.lofty.com/hc/en-us/articles/53175344564507-Managing-Family-Members-Lofty-AOS); [Lofty help: Merging Duplicates](https://help.lofty.com/hc/en-us/articles/360054872172-Duplicate-Leads-Merging-Duplicates)
- **BoldTrail/kvCORE**: has a Spouse field, but "The person in the Spouse field will not receive communications. If you'd like both partners to receive auto-communication add them as their own lead." (snippet) — [BoldTrail: Add a contact](https://help.insiderealestate.com/en/articles/7980636-boldtrail-onboarding-add-a-contact-learn-automations)
- **Wise Agent**: spouse is a set of fields on the same record (Spouse, Spouse Mobile Phone, Spouse Business Phone, Spouse E-mail Address, Spouse Birthday), alongside children's birthdays and pets' names. (snippet) — [Wise Agent: acceptable CSV column headers](https://wise-agent-crm.groovehq.com/help/acceptable-csv-column-headers); [TrustRadius: Wise Agent](https://www.trustradius.com/products/wise-agent-crm/details)
- **Top Producer X**: related contacts "whether they're a spouse, partner, tenant, child, etc. are searchable and you can input all their information since they have their own record." Links are set on a Relationships tab (default type "Spouse", changeable). Old 8i records where a spouse shared one record show a "Convert to Relationship" button. (snippet) — [Top Producer X: Relationships](https://support.topproducer.com/x-contacts/top-producer-x-crm-relationships/)
- **Reapit (UK)**: joint parties are expressed on the role, not the person: Joint Landlords section for multiple landlords; Second Vendor and Additional Vendors sections for vendors; both search the contact database before creating a new record. Applicant/vendor/landlord each reference "one or more contacts." There is also a "Key Contact" setting in the contact Relationships panel. (snippet / fetched) — [Reapit wiki](https://reapit.atlassian.net/wiki/x/LADxd); [Reapit Foundations platform glossary](https://foundations-documentation.reapit.cloud/platform-glossary)
- **Reapit Sales (AU)**: "Related Contacts" can be added, removed and edited, with a relationship label set on each side. (snippet) — [Reapit Sales help: Related Contacts](https://beta.help.reapit.com.au/sales/contacts-and-communication/Related-Contacts)
- **Street.co.uk**: multi-tenant tenancies can mark a lead tenant with a star toggle. (snippet) — [Street development updates, August 2026](https://intercom.help/streetcouk/en/articles/16998372-street-development-updates-for-august-2026)
- **Reapit contact model**: fixed phone slots (`homePhone`, `mobilePhone`, with `email`) rather than a phone list, in the condensed API example. (fetched) — [Reapit Foundations API documentation](https://foundations-documentation.reapit.cloud/api/api-documentation)
- Comparison outside the assigned set: Real Geeks allows exactly one secondary contact per lead, who receives the same emails but cannot be contacted directly from the CRM. (snippet) — [Real Geeks: Secondary contacts](https://support.realgeeks.com/secondary-contacts-in-the-real-geeks-crm)

### Inferences
- Design 1 (Rex shared record) optimises for mail-merge salutations and treating a couple as one owner; its cost is that a member who later acts alone (divorce, buys separately) has to be split out. Design 2 keeps the spouse reachable but not searchable as a person and unable to hold their own roles. Design 3 is the only one where each spouse can independently be owner of one unit and buyer of another; Top Producer's move from 2 to 3 and its conversion tool suggest design 2 did not hold up.
- The Korean app's ContactRelation (contact-to-contact) plus role tables is design 3, the same as Reapit and Top Producer X. What those products add on top is a way to treat the pair as a unit at the role level (Reapit: one applicant or vendor record referencing two contacts; FUB/Lofty: one shared timeline).
- Phone storage ranges from a typed list with primary flag (FUB) to fixed slots (Reapit, Wise Agent). Rex is the only one found that tags each phone/email to a named person inside a shared record.

### Gaps
- VaultRE: whether one contact record can hold two people's names was not confirmed by any source I could read.
- AgentBox, Alto, LionDesk: no documentation retrieved on couples/joint handling.
- FUB: the cap on relationships per person, and whether an incoming call from a related person's number is matched to the primary profile, were not confirmed (help article returned 403).

## 4. Stage/status: per person or per deal? What happens when a person is both buying and selling?

### Takeaway
US CRMs keep a single stage on the person and a separate stage on each deal; a person who is both buying and selling is handled by a multi-valued type/tag on the person plus two deals in different pipelines, not by two person stages. AU/UK CRMs avoid the problem structurally because each role record (applicant, vendor, tenancy) carries its own status.

### Cited Findings
- **Follow Up Boss**: stage is a single value on the person (API filter "Search for person by stage name"; a `Trash` stage is excluded by default). Help describes contact stages as tracking who a contact is to you right now. (fetched / snippet) — [FUB API: List people](https://docs.followupboss.com/reference/people-get); [FUB help: Changing a Lead Stage](https://help.followupboss.com/hc/en-us/articles/360012456793-Changing-a-Lead-Stage)
- **Follow Up Boss**: deals sit in pipelines with their own stages; the default pipelines are "Buyers" and "Sellers" and the account owner can change them. A deal requires a `stageId` and lists `peopleIds`. (snippet / fetched) — [FUB help: Pipelines and Stages](https://help.followupboss.com/hc/en-us/articles/360015310313); [FUB API: Create deal](https://docs.followupboss.com/reference/deals-post)
- **Follow Up Boss**: lead source is a single field on the person; `createdVia` records how the person was created (API, Email Parsing, Historic Email Parsing, Import, Manually). (fetched) — [FUB API: List people](https://docs.followupboss.com/reference/people-get)
- **BoldTrail**: status and lead type are separate fields; lead type is independent of "where they are in the buying/selling process." (snippet) — [BoldTrail Lead Types Overview](https://help.insiderealestate.com/en/articles/4626537-boldtrail-lead-types-overview)
- **Lofty**: one `stage` string per lead, configurable per team (New Lead, Contacted, Qualified, Under Contract, Closed named as common); `leadTypes` is multi-valued; UI offers "Buyer & Seller." (fetched / snippet) — [Lofty developer docs: Leads](https://developer.lofty.com/concepts/leads.md); [Lofty help: Merging Duplicates](https://help.lofty.com/hc/en-us/articles/360054872172-Duplicate-Leads-Merging-Duplicates)
- **Wise Agent**: "a contact can hold only one status at a time, unlike categories." (snippet) — [Wise Agent blog](https://wiseagent.com/blog/wise-agents-contact-management-system-find-hidden-gems-in-your-crm)
- **Street.co.uk**: the persona-pill help uses the buyer-who-is-also-a-vendor case as its main example: pills let you "see at a glance that a buyer is also a vendor you act for," and pills also appear in the sales chain sidebar. (fetched) — [Street help: Persona pills](https://intercom.help/streetcouk/en/articles/16554380-persona-pills)
- **Reapit**: vendor, applicant, landlord and tenancy are separate records linked to the same contact, so each has its own lifecycle. (fetched) — [Reapit Foundations platform glossary](https://foundations-documentation.reapit.cloud/platform-glossary)
- **AgentBox / Reapit Sales**: separate documented lifecycles for Vendor/Owner, Landlord and Buyer; classes accumulate on the one contact as events occur. (snippet) — [Reapit Sales help: Life Cycle of a Contact](https://beta.help.reapit.com.au/sales/getting-started/Life-Cycle-of-a-Contact)

### Inferences
- A single person-level stage is a known weak point for move-up clients in US CRMs: the stage has to describe one journey, so the second journey is only visible through tags and deals. This is the same decision the Korean app already made in the other direction (lifecycle on the intake, not on the contact).
- Street and Reapit confirm that for chain/move-up transactions the workable pattern is "status per role record, badge on the person."

### Gaps
- No official FUB source was found stating how to represent one person in both the Buyers and Sellers pipelines; whether two simultaneous deals for one person is the documented practice is an inference from the Deal API shape.
- Rex has a "contact pipeline management" feature page; I did not retrieve what the pipeline stage attaches to. [Rex: contact pipeline management](https://www.rexsoftware.com/features/contact-pipeline-management)

## 5. Other agents, co-broke contacts, solicitors, suppliers: separate address book or same table?

### Takeaway
Most products keep them in the same contact table and distinguish them with a type/category (BoldTrail "Agent" and "Vendor" lead types, Lofty "Agent" type). Reapit is the clear exception with a separate Company entity typed as solicitor, supplier and so on; FUB tells users not to attach such parties as relationships.

### Cited Findings
- **BoldTrail**: "Vendor" and "Agent" are two of the five lead types on the ordinary contact record. (snippet) — [BoldTrail Lead Types Overview](https://help.insiderealestate.com/en/articles/4626537-boldtrail-lead-types-overview)
- **Lofty**: "Agent" (7) is one of the lead type values on a lead. (fetched) — [Lofty developer docs: Leads](https://developer.lofty.com/concepts/leads.md)
- **Reapit**: Company is "a business organisation the agent has a relationship with," with types such as solicitor or supplier, and can participate in property transactions; Negotiator (agency staff) is a separate entity again. (fetched) — [Reapit Foundations platform glossary](https://foundations-documentation.reapit.cloud/platform-glossary)
- **Follow Up Boss**: "We do not recommend using the contact relationship feature to track additional contacts such as vendors, the referring agent, or title company." (snippet) — [FUB help: Contact Relationships](https://help.followupboss.com/hc/en-us/articles/1500008593181)
- **Rex**: contacts can be linked to company records as well as to other contacts. (snippet) — [Rex help: Introduction to the Contacts Module](https://support.rexsoftware.com/hc/en-us/articles/360025447433-Introduction-to-the-Contacts-Module)
- **Street.co.uk**: "PC — Point of Contact" is one of the persona pills, i.e. a role a person can hold alongside vendor/landlord/tenant. (fetched) — [Street help: Persona pills](https://intercom.help/streetcouk/en/articles/16554380-persona-pills)
- **Propertybase**: has a Contacts & Companies help section (Salesforce Account as company). (snippet) — [Propertybase help: Contacts & Companies](https://help.propertybase.com/hc/en-us/sections/115000829012-Contacts-Companies)

### Inferences
- The split that matters in these products is person vs organisation, not client vs professional: other agents as individuals stay in the contact table with a category, and their firm is a company record.

### Gaps
- No source retrieved on how AgentBox, VaultRE or Alto store solicitors/conveyancers or other agents (conjunctional agents).
- No source on how FUB recommends storing co-op agents beyond the negative guidance above.

## 6. Phone-centric features: caller ID matching, duplicate detection on create, merge

### Takeaway
Duplicate handling is documented everywhere, but the key differs: BoldTrail deduplicates on email only, Street on email and phone across the whole group, FUB deduplicates automatically and offers a bulk merge of up to 10. Lofty's merge dialog is the most relevant idea found: when two records look like duplicates the user chooses between "same person" and "family member."

### Cited Findings
- **Follow Up Boss**: the platform "automatically deduplicates leads" and provides a merge for one-off cases; manual merge is done by selecting duplicates in the list and using Mass Actions (up to 10 at once), or from a lead profile under Relationships via "Merge Existing Person"; a note is added to the timeline recording the merge and any information that could not be merged automatically. (snippet) — [FUB help: merging](https://help.followupboss.com/hc/en-us/articles/11460704008855)
- **Lofty**: flagged duplicates offer "Merge as Duplicates," "Merge as Family Members," and "View Lead Detail"; Lofty recommends choosing as primary the lead with the most communication logs. (snippet) — [Lofty help: Merging Duplicates](https://help.lofty.com/hc/en-us/articles/360054872172-Duplicate-Leads-Merging-Duplicates)
- **BoldTrail/kvCORE**: duplicates are identified by email address: importing "a contact that has the same email address" is stopped; "One Agent or Admin cannot own two leads with the same email address." A Merge action exists on the contact record. (snippet / fetched) — [kvCORE: Duplicate contacts & lead ownership](https://help.insiderealestate.com/en/articles/3317508-kvcore-duplicate-contacts-lead-ownership); [BoldTrail Contact Record Overview](https://help.insiderealestate.com/en/articles/4619572-boldtrail-contact-record-overview)
- **Street.co.uk**: on applicant registration the system checks email and phone number across the group; if a match is found "the record is merged or flagged to prevent duplicate management." One record "Per applicant across all branches"; vendor/landlord records are shared across branches ("the landlord with two of your branches becomes one contact, not two"). (fetched / snippet) — [Street: Applicant registration & matching](https://street.co.uk/product/index/applicant-registration-matching); [Street: multi-branch](https://street.co.uk/solutions/multi-branch)
- **Reapit (UK)**: adding a joint landlord or additional vendor searches the contact database before creating a new record. (snippet) — [Reapit wiki](https://reapit.atlassian.net/wiki/x/LADxd)
- **VaultRE**: documents attaching a property to an existing contact specifically to avoid duplicate entries. (snippet) — [VaultRE help: Add a property to an existing contact](https://support.vaultre.com.au/hc/en-au/articles/360004179656-Add-a-property-to-an-existing-contact)
- **Rex**: opening a contact shows "the call history, notes and contact details." (snippet) — [Rex help: Introduction to the Contacts Module](https://support.rexsoftware.com/hc/en-us/articles/360025447433-Introduction-to-the-Contacts-Module)

### Inferences
- Email-only dedup (BoldTrail) fits a web-lead business; the phone-first Korean context is closer to Street's email-or-phone check. Because couples and family proxies often share or swap numbers, Lofty's "duplicate or family member?" choice at match time addresses a case a pure phone-uniqueness rule gets wrong.

### Gaps
- Caller ID / inbound call pop matched by phone number: no source retrieved for any of the products that describes the matching rule (which number wins when two contacts share a phone, whether related people's numbers match). FUB and BoldTrail have built-in dialers, but I did not find documentation of inbound matching.
- Rex deduplication: a "data deduplication" release page exists but the fetched page contained no dedup content, so matching rules are unknown. [Rex updates](https://www.rexsoftware.com/updates/feature-release-data-deduplication)
- FUB's automatic dedup key (email, phone, or both) was not confirmed from an official page.

## 7. Contact list screen: default columns, smart lists/saved filters, bulk actions

### Takeaway
Evidence here is thin because the relevant help pages could not be read. What is confirmed: lists are filter-driven (FUB Smart Lists exist as an object, Lofty has filters, pipeline stages and segments, Alto has saved contact groups/match groups), and bulk actions hang off list selection (FUB Mass Actions, including merge).

### Cited Findings
- **Follow Up Boss**: Mass Actions on selected people in the list, including merge of up to 10. SmartLists is a first-class object in the FUB data model as seen by connectors. (snippet) — [FUB help: merging](https://help.followupboss.com/hc/en-us/articles/11460704008855); [Skyvia FUB connector docs](https://docs.skyvia.com/Connectors/cloud-sources/followupboss_connections.html)
- **Follow Up Boss**: people can be filtered by stage, source, assigned user, contacted flag, price, tags and custom fields (API list filters mirror the UI filters). (fetched) — [FUB API: List people](https://docs.followupboss.com/reference/people-get)
- **Lofty**: separate help articles exist for "Lead Organization with Filters," pipeline stages and segments. (snippet, titles only) — [Lofty help: Lead Organization with Filters](https://help.lofty.com/hc/en-us/articles/360055290571-Lead-Organization-with-Filters)
- **Street.co.uk**: there are separate sales applicants and lettings applicants tables; since August 2026 they show persona pills so other roles are visible without opening the record; an applicant table never shows its own type's pill; pills are not shown on match or mail lists. (fetched / snippet) — [Street help: Persona pills](https://intercom.help/streetcouk/en/articles/16554380-persona-pills); [Street development updates, August 2026](https://intercom.help/streetcouk/en/articles/16998372-street-development-updates-for-august-2026)
- **Alto**: contacts can be saved into named groups; match groups sit under Shared Groups. (snippet) — [Alto help: Creating a group of contacts](https://support.altosoftware.co.uk/hc/en-gb/articles/5048088104095)
- **BoldTrail**: record-level manage actions include Share, Transfer, Merge, Make Private, Move to Pond, Archive, Delete, Export. (fetched) — [BoldTrail Contact Record Overview](https://help.insiderealestate.com/en/articles/4619572-boldtrail-contact-record-overview)

### Inferences
- Street's lists are per role (applicant tables, with vendors/landlords reached via properties) rather than one undifferentiated people list, and the person's other roles appear as badges in the row. This is a concrete precedent for a role-scoped list over a single unified person table.

### Gaps
- Default columns of the people/contact list were not confirmed for any product.
- FUB Smart List definitions and defaults, Lofty segments detail, Rex contact list filters and saved lists, VaultRE/AgentBox list screens: not retrieved.

## 8. Contact detail screen: layout, related items, activity logging

### Takeaway
The confirmed common shape is three zones: identity and attributes on one side, a chronological timeline of all communication in the middle as the default view, and actions plus related work items (tasks, appointments, deals/transactions, files) on the other side. AU/UK products add related people and related properties with role labels as a core part of the record.

### Cited Findings
- **BoldTrail**: "The contact's record will open to the Timeline by default." Four sections: Contact Details (left: name, status, lead type, contact info, hashtags, web activity incl. creation date and source), Timeline (activity, communications both ways, notes, tasks, calls, plus future campaign touch points), Contact Actions (right: call, text, email, note, task; then Tasks, Appointments, Engagement, Files, Transactions), and Personal Information (an edit modal: Contact Info, Contact Options, Permission to Contact, Relationship, Primary Address, Valuation, Home Preferences, Social Media, Assigned Agent & Lender, Referral Source). (fetched) — [BoldTrail Contact Record Overview](https://help.insiderealestate.com/en/articles/4619572-boldtrail-contact-record-overview)
- **Follow Up Boss**: tasks, appointments, files and deals are created, viewed and completed on the lead profile page; relationships are a section on the profile; starred timeline items get their own section; communication with related people is threaded into the same profile with names labelled. (snippet / fetched) — [FUB help](https://help.followupboss.com/hc/en-us/articles/9538400649495); [FUB updates: Contact Relationships](https://updates.followupboss.com/en/better-together-contact-relationships-)
- **Follow Up Boss**: a third-party integration describes the timeline as containing every note, task, email, text, appointment, deal and event. (snippet, third party) — [Follow Up Ace: Contact Management](https://followupace.com/integrations/contact-management/)
- **Wise Agent**: the Contact Summary page opens with a status bar giving an overview of the agent's relationship with the contact; referral information is on the same page. (snippet) — [Wise Agent help: Contact Summary page](https://wise-agent-crm.groovehq.com/help/the-contact-summary-page-explained)
- **Lofty**: lead type is shown under the lead's name on the profile; family members' contact details appear inside the call/text/email pickers. (snippet) — [Lofty help: Lead Profile Page](https://help.lofty.com/hc/en-us/articles/360055290591-Lead-Profile-Page); [Lofty help: Managing Family Members](https://help.lofty.com/hc/en-us/articles/53175344564507-Managing-Family-Members-Lofty-AOS)
- **Rex**: opening a contact presents "the call history, notes and contact details for the individual you are working with, as well as all of that Contact's related people or Properties"; a "Stream" records every interaction with any user in the agency. (snippet) — [Rex help: Introduction to the Contacts Module](https://support.rexsoftware.com/hc/en-us/articles/360025447433-Introduction-to-the-Contacts-Module); [Rex: integrated history](https://www.rexsoftware.com/feature/integrated-history)
- **Street.co.uk**: persona pills appear on the person page, owner and tenant details on a property page, Enquiry Centre, sales chain sidebar, viewing contacts in the diary, and @mentions in notes; hover opens a context card for that role. (fetched) — [Street help: Persona pills](https://intercom.help/streetcouk/en/articles/16554380-persona-pills)
- **Top Producer X**: relationships have their own tab on the contact. (snippet) — [Top Producer X: Relationships](https://support.topproducer.com/x-contacts/top-producer-x-crm-relationships/)
- **AgentBox**: where the office also uses Reapit property management, the contact panel shows linked records across both systems, with each property carrying a role/status. (snippet) — [Reapit wiki: Agentbox contact panel](https://reapit.atlassian.net/wiki/spaces/RW/pages/672497665/Agentbox+contact+panel+APAC+only)

### Inferences
- The timeline is the centre of the screen in US products because the record is mostly a communication target; in AU/UK products the "related properties with role" block carries equal weight because the record is also a party to property records.
- Street's hover card per role (what they are selling, what tenancy they hold) is a compact answer to "what is this person to us" without separate owner and buyer screens.

### Gaps
- The widely repeated description of FUB's profile as "details left, timeline centre, deals/tasks right" was not confirmed from an official page I could read; treat the column positions as unverified.
- Rex, VaultRE, AgentBox and Reapit contact screen tab lists were not retrieved.

## 9. Known user complaints about contact structure

### Takeaway
I found no reliable first-hand complaints (Reddit, G2, Capterra) specific to contact structure in these products within the search budget; this section is mostly indirect evidence. The indirect evidence points at couples as the recurring problem: vendors keep changing how spouses are stored and document workarounds.

### Cited Findings
- **BoldTrail** documents a limitation and a workaround in its own help: the Spouse field does not receive communications, so users are told to add the partner as a separate lead. (snippet) — [BoldTrail: Add a contact](https://help.insiderealestate.com/en/articles/7980636-boldtrail-onboarding-add-a-contact-learn-automations)
- **Follow Up Boss** acknowledged that before Relationships, customers commonly put the spouse's email as an extra email on the same contact. (snippet) — [FUB blog: January 2019 product update](https://www.followupboss.com/blog/january-2019-product-update)
- **Top Producer** replaced the 8i shared-record spouse with separate related records and shipped a conversion button. (snippet) — [Top Producer X: Relationships](https://support.topproducer.com/x-contacts/top-producer-x-crm-relationships/)
- **Lofty**: mass emails go only to the primary lead, not family members. (snippet) — [Lofty help: Managing Family Members](https://help.lofty.com/hc/en-us/articles/53175344564507-Managing-Family-Members-Lofty-AOS)
- A 2026 CRM-cleanup guide lists a spouse added separately from the primary contact as a common cause of split contact history. (snippet, third-party blog of unknown authority) — [US Tech Automations](https://ustechautomations.com/resources/blog/how-to-real-estate-agent-crm-pre-flight-checklist-2026)
- A Salesforce data vendor warns that merging records can overwrite fields such as Opt-Out or Do Not Call. (snippet, vendor marketing) — [Traction Complete](https://tractioncomplete.com/articles/duplicate-salesforce-data-real-estate/)
- **Street.co.uk** markets its single-person model against the opposite failure: one landlord appearing as two contacts across branches. (snippet, vendor marketing) — [Street: multi-branch](https://street.co.uk/solutions/multi-branch)

### Inferences
- Both couple designs generate their own complaint: sub-entry spouses are second-class (no automation, no mass email, cannot hold their own roles), while separate records split the history unless the product threads them back together. Products that have settled (Top Producer X, Reapit, FUB with shared timeline) use separate or semi-separate people plus a way to act on them as a unit.

### Gaps
- No Reddit r/realtors, G2 or Capterra review text was retrieved; statements about user sentiment above are inferred from vendor documentation, not from users.
- No complaint evidence found for Rex, VaultRE, AgentBox, Reapit, Alto, Wise Agent, LionDesk or Propertybase on contact structure.
- LionDesk overall: no source retrieved on any question; it is effectively uncovered in these notes.
