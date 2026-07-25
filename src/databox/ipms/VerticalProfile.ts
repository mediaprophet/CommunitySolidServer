/* eslint-disable sort-imports */
import type { BlankNode, Literal, NamedNode, Quad, Term } from '@rdfjs/types';
import { DataFactory, Parser, Writer } from 'n3';
import { DC, IPMS, RDF } from '../../util/Vocabularies';
import type { DataboxModuleRegistry } from './DataboxModuleRegistry';
import type { ModuleConfigStore } from './ModuleConfigStore';

const SCHEMA = 'https://schema.org/';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const RDF_FIRST = namedNode(`${RDF.namespace}first`);
const RDF_REST = namedNode(`${RDF.namespace}rest`);
const RDF_NIL = namedNode(`${RDF.namespace}nil`);
const RDF_VALUE = namedNode(`${RDF.namespace}value`);

const TERMS = {
  verticalProfile: namedNode(`${IPMS.namespace}VerticalProfile`),
  identifier: namedNode(`${SCHEMA}identifier`),
  softwareVersion: namedNode(`${SCHEMA}softwareVersion`),
  useCaseList: namedNode(`${IPMS.namespace}useCaseList`),
  moduleList: namedNode(`${IPMS.namespace}moduleList`),
  moduleId: namedNode(`${IPMS.namespace}moduleId`),
  required: namedNode(`${IPMS.namespace}required`),
  enabledByDefault: namedNode(`${IPMS.namespace}enabledByDefault`),
  defaultConfig: namedNode(`${IPMS.namespace}defaultConfig`),
  contentType: namedNode(`${IPMS.namespace}contentType`),
  rationale: namedNode(`${IPMS.namespace}rationale`),
};

export interface VerticalProfileDefaultConfig {
  readonly contentType: 'text/turtle';
  readonly turtle: string;
}

export interface VerticalProfileModuleReference {
  readonly moduleId: string;
  readonly required: boolean;
  readonly enabledByDefault: boolean;
  readonly rationale: string;
  readonly defaultConfig?: VerticalProfileDefaultConfig;
}

/**
 * Declarative vertical bundle manifest: a profile composes existing horizontal IPMS modules by id.
 *
 * The manifest carries no executable behaviour. Its defaults are ordinary RDF Turtle that can be committed
 * through {@link ModuleConfigStore}; CSS-enhanced runtimes can apply it, and vanilla Solid runtimes can still
 * discover and inspect it as RDF.
 */
export interface VerticalProfileManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly useCases: readonly string[];
  readonly modules: readonly VerticalProfileModuleReference[];
}

export interface VerticalProfileValidationResult {
  readonly profile: VerticalProfileManifest;
  readonly missingModules: readonly string[];
}

export interface VerticalProfileRdfOptions {
  readonly subjectIri?: string;
  readonly baseIri?: string;
}

export const FOOD_RESTAURANT_VERTICAL_PROFILE: VerticalProfileManifest = {
  id: 'food.restaurant',
  name: 'Food / Restaurant',
  version: '0.1.0',
  description: 'Small restaurant bundle for menus, ordering-adjacent commerce, reservations, receipts, and public SEO.',
  useCases: [ 'FOOD' ],
  modules: [
    moduleRef('menu', 'Menus are the public food offer and allergen-facing catalogue surface.'),
    moduleRef('catalogue', 'Catalogue resources hold products, modifiers, variants, and publishable item metadata.', {
      turtle: '<> <https://schema.org/itemListOrder> "menu-section" .',
    }),
    moduleRef('stock', 'Stock keeps menu availability honest for a small operator.'),
    moduleRef('payments', 'Payments handles checkout adapters while keeping payment secrets out of portable works.'),
    moduleRef('receipt', 'Receipts produce RDF-backed proof of purchase and the printable QR payload.', {
      turtle: '<> <urn:solid-server:databox:ipms#receiptProfile> "consumer-digital-receipt" .',
    }),
    moduleRef('bookings', 'Bookings supports table reservations, deposits, cancellation and rescheduling.'),
    moduleRef('events', 'Events covers special sittings, tastings, and venue programming.'),
    moduleRef('opening-hours', 'Opening hours provides ordinary schema.org availability for public discovery.', {
      turtle: '<> <https://schema.org/servesCuisine> "local" .',
    }),
    moduleRef('website-seo', 'Website SEO publishes JSON-LD and discovery metadata without requiring CSS routes.'),
    moduleRef('mcp-server', 'MCP Server provides an AI-native interface for the public restaurant menu and bookings.'),
    moduleRef('barcode', 'Barcode scanner enables GS1-aware product lookup and inventory scanning at the POS.'),
    moduleRef('eftpos', 'EFTPOS terminal integration for card payments at the counter.'),
    moduleRef('backups', 'Password-protected encrypted backups of menu, bookings, and financial data.'),
    moduleRef('accounting', 'Accounting export to Xero/MYOB/QuickBooks for daily sales reconciliation.'),
  ],
};

export const HEALTH_PRIVACY_CONSENT_VERTICAL_PROFILE: VerticalProfileManifest = {
  id: 'health.privacy-consent',
  name: 'Health / Privacy Consent',
  version: '0.1.0',
  description: 'Health privacy bundle for consent, access, correction, governance, delegation, and emergency access.',
  useCases: [ 'HEALTH' ],
  modules: [
    moduleRef('consent', 'Consent records purpose-limited processing decisions as RDF policy state.', {
      turtle: '<> <urn:solid-server:databox:ipms#defaultPurpose> "care-provision" .',
    }),
    moduleRef('access-request', 'Access requests support patient rights over held records.'),
    moduleRef('correction-request', 'Correction requests support amendment workflows without destructive edits.'),
    moduleRef('governance', 'Governance supplies approval gates and auditable resolutions for sensitive handling.', {
      turtle: '<> <urn:solid-server:databox:ipms#approvalMode> "dual-control-for-sensitive-data" .',
    }),
    moduleRef('delegation', 'Delegation gives carers and guardians scoped revocable authority.'),
    moduleRef('break-glass', 'Break-glass access is temporary, conditional, and audited for emergencies.'),
    moduleRef('credential-gate', 'Credential gates verify qualifications or care roles with minimal disclosure.'),
    moduleRef('backups', 'Password-protected encrypted backups of consent records and health data for compliance.'),
  ],
};

export const AUTO_PORTABLE_RECORDS_VERTICAL_PROFILE: VerticalProfileManifest = {
  id: 'auto.portable-records',
  name: 'Auto / Portable Records',
  version: '0.1.0',
  description: 'Automotive bundle demonstrating owner-controlled longitudinal vehicle logs and booking flow.',
  useCases: [ 'AUTO' ],
  modules: [
    moduleRef('catalogue', 'Catalogue stores repair services and parts as typed schema.org services.', {
      turtle: '<> <https://schema.org/category> "AutomotiveRepair" .',
    }),
    moduleRef('bookings', 'Bookings manages service appointments, bays, and mechanic slots.'),
    moduleRef('records', 'Records issues append-only, customer-owned vehicle service histories.'),
    moduleRef('website-seo', 'Website SEO for local auto repair visibility.'),
    moduleRef('jobs', 'Jobs handles the physical work-order intake, queuing, and completion pipeline.', {
      turtle: '<> <urn:solid-server:databox:ipms#pipelineMode> "vehicle-repair" .',
    }),
  ],
};

export const MEMBER_GOVERNANCE_VERTICAL_PROFILE: VerticalProfileManifest = {
  id: 'member.governance',
  name: 'Member / Governance',
  version: '0.1.0',
  description: 'Membership bundle for clubs/co-ops with pluralistic voting and VC-issued credentials.',
  useCases: [ 'MEMBER' ],
  modules: [
    moduleRef('governance', 'Governance manages one-member-one-vote resolutions and approval chains.', {
      turtle: '<> <urn:solid-server:databox:ipms#votingModel> "democratic" .',
    }),
    moduleRef('events', 'Events models club meetups, AGMs, and tournaments.'),
    moduleRef('ticketing', 'Ticketing issues verifiable tickets and VC-based membership cards.'),
    moduleRef('social', 'Social enables member directory interaction and noticeboards.'),
    moduleRef('payments', 'Payments collects recurring membership dues and event fees.'),
  ],
};

export const SPORTING_CLUB_BASE_PROFILE: VerticalProfileManifest = {
  id: 'sport.club-base',
  name: 'Sporting Club / Base',
  version: '0.1.0',
  description: 'Foundational bundle for any sporting club, providing membership ' +
    'governance, social directory, dues collection, and a POS canteen.',
  useCases: [ 'SPORT' ],
  modules: [
    moduleRef('governance', 'Governance manages club resolutions, committee voting, and AGMs.'),
    moduleRef('social', 'Social enables member directories and club noticeboards.'),
    moduleRef('payments', 'Payments collects recurring club membership dues.'),
    moduleRef('pos', 'POS runs the physical club canteen and merchandise shop.', {
      turtle: '<> <urn:solid-server:databox:ipms#posMode> "canteen" .',
    }),
  ],
};

export const SPORTING_LEAGUE_PROFILE: VerticalProfileManifest = {
  id: 'sport.league-team',
  name: 'Sporting League / Team Sports',
  version: '0.1.0',
  description: 'Specialized profile for team sports (AFL, Soccer, Netball) requiring ' +
    'rostering, match events, and ladder records.',
  useCases: [ 'SPORT', 'LEAGUE' ],
  modules: [
    ...SPORTING_CLUB_BASE_PROFILE.modules,
    moduleRef('events', 'Events models the weekly match fixtures and training sessions.'),
    moduleRef('records', 'Records is used to store longitudinal ladders, standings, and match results.'),
  ],
};

export const SPORTING_FACILITY_PROFILE: VerticalProfileManifest = {
  id: 'sport.facility-court',
  name: 'Sporting Facility / Court & Course',
  version: '0.1.0',
  description: 'Specialized profile for facility sports (Tennis, Golf, Lawn Bowls) ' +
    'requiring granular court/course bookings and physical access control.',
  useCases: [ 'SPORT', 'FACILITY' ],
  modules: [
    ...SPORTING_CLUB_BASE_PROFILE.modules,
    moduleRef('bookings', 'Bookings manages 30-min court intervals or Golf Tee-Times.', {
      turtle: '<> <urn:solid-server:databox:ipms#bookingGranularity> "PT30M"^^<http://www.w3.org/2001/XMLSchema#duration> .',
    }),
    moduleRef('access', 'Access links bookings to physical gates and lighting controllers.'),
  ],
};

export const SPORTING_COMPLIANCE_PROFILE: VerticalProfileManifest = {
  id: 'sport.compliance-safety',
  name: 'Sporting Compliance / Safety & Grading',
  version: '0.1.0',
  description: 'Specialized profile for high-risk or graded sports (Life Saving, ' +
    'Equestrian, Martial Arts) requiring WWCC checks, belts, and emergency access.',
  useCases: [ 'SPORT', 'SAFETY' ],
  modules: [
    ...SPORTING_CLUB_BASE_PROFILE.modules,
    moduleRef('credentials', 'Credentials issues and verifies safety certifications, ' +
    'Working With Children Checks, and grading belts.'),
    moduleRef('emergency', 'Emergency provides break-glass access to member medical info during a sporting incident.'),
  ],
};

export const GLAM_BASE_PROFILE: VerticalProfileManifest = {
  id: 'glam.base',
  name: 'GLAM / Base',
  version: '0.1.0',
  description: 'Foundational bundle for GLAM institutions focusing on cataloguing ' +
    'physical/digital artifacts and public discovery.',
  useCases: [ 'GLAM' ],
  modules: [
    moduleRef('catalogue', 'Catalogue stores structured metadata about collections using Dublin Core standards.', {
      turtle: `
        @prefix dc: <http://purl.org/dc/terms/> .
        <> <https://schema.org/genre> "Collection" ;
           dc:publisher "GLAM Institution" ;
           dc:rights "All Rights Reserved" ;
           dc:format "Digital Archive" .
      `,
    }),
    moduleRef('website-seo', 'Website SEO exposes finding aids and digital collections to public search engines.'),
    moduleRef('mcp-server', 'MCP Server exposes the public catalog and discovery endpoints to AI agents.'),
  ],
};

export const GLAM_GALLERY_MUSEUM_PROFILE: VerticalProfileManifest = {
  id: 'glam.gallery-museum',
  name: 'GLAM / Gallery & Museum',
  version: '0.1.0',
  description: 'Specialized profile for Galleries and Museums requiring exhibitions, ' +
    'timed ticketing, and strict provenance tracking.',
  useCases: [ 'GLAM', 'MUSEUM' ],
  modules: [
    ...GLAM_BASE_PROFILE.modules,
    moduleRef('events', 'Events schedules exhibitions and guided tours.'),
    moduleRef('ticketing', 'Ticketing handles timed-entry passes and special access.'),
    moduleRef('provenance', 'Provenance tracks the chain of custody, acquisition ' +
    'history, and C2PA cryptographic authenticity of artifacts.', {
      turtle: `
        @prefix c2pa: <https://c2pa.org/terms/> .
        <> a c2pa:Manifest ;
           c2pa:action "c2pa.created" ;
           c2pa:softwareAgent "Databox IPMS GLAM Module" .
      `,
    }),
  ],
};

export const GLAM_LIBRARY_PROFILE: VerticalProfileManifest = {
  id: 'glam.library',
  name: 'GLAM / Library',
  version: '0.1.0',
  description: 'Specialized profile for Libraries focusing on OPAC lending, inventory ' +
    'management, and digital credentials.',
  useCases: [ 'GLAM', 'LIBRARY' ],
  modules: [
    ...GLAM_BASE_PROFILE.modules,
    moduleRef('inventory', 'Inventory tracks physical copies and their condition.'),
    moduleRef('bookings', 'Bookings manages the lending and return dates of media, and reservations of reading rooms.'),
    moduleRef('credentials', 'Credentials provides VC-based digital library cards for patrons.'),
  ],
};

export const GLAM_ARCHIVE_PROFILE: VerticalProfileManifest = {
  id: 'glam.archive',
  name: 'GLAM / Archive',
  version: '0.1.0',
  description: 'Specialized profile for Archives requiring deep hierarchical ' +
    'cataloguing, high-res digital scans, and restricted access.',
  useCases: [ 'GLAM', 'ARCHIVE' ],
  modules: [
    ...GLAM_BASE_PROFILE.modules,
    moduleRef('hosting', 'Hosting provides storage for high-resolution digital ' +
    'preservation scans.'),
    moduleRef('access', 'Access ensures culturally sensitive or legally restricted ' +
    'artifacts are only viewed by authorized researchers.'),
  ],
};

export const GLAM_HISTORICAL_SOCIETY_PROFILE: VerticalProfileManifest = {
  id: 'glam.historical-society',
  name: 'GLAM / Historical Society',
  version: '0.1.0',
  description: 'Composite profile for Historical Societies combining club governance ' +
    'with archival and storytelling tools.',
  useCases: [ 'GLAM', 'MUSEUM', 'ARCHIVE', 'CLUB' ],
  modules: [
    ...GLAM_BASE_PROFILE.modules,
    moduleRef('governance', 'Governance handles the society committee, voting, and constitution.'),
    moduleRef('social', 'Social enables community engagement and member directories.'),
    moduleRef('payments', 'Payments collects annual society membership dues.'),
    moduleRef('provenance', 'Provenance tracks local artifacts and genealogical ' +
    'materials, utilizing C2PA for digital authenticity validation.', {
      turtle: `
        @prefix c2pa: <https://c2pa.org/terms/> .
        <> a c2pa:Manifest ;
           c2pa:action "c2pa.published" ;
           c2pa:softwareAgent "Databox Historical Society" .
      `,
    }),
    moduleRef('feeds', 'Feeds publishes local history blogs and monthly newsletters.'),
  ],
};

export const HOME_SERVICES_BASE_PROFILE: VerticalProfileManifest = {
  id: 'home-services.base',
  name: 'Home Services / Base',
  version: '0.1.0',
  description: 'Foundational bundle for routine domestic service businesses, focusing ' +
    'on recurring routes, task management, and client billing.',
  useCases: [ 'HOME_SERVICES' ],
  modules: [
    moduleRef('jobs', 'Jobs tracks the daily task list and execution checklists.', {
      turtle: '<> <http://schema.org/repeatFrequency> "P1W"^^<http://www.w3.org/2001/XMLSchema#duration> .',
    }),
    moduleRef('bookings', 'Bookings manages the recurring service routes and time slots.'),
    moduleRef('quotations', 'Quotations issues upfront pricing for one-off cleanups or ongoing contracts.'),
    moduleRef('payments', 'Payments collects automated subscription billing for recurring services.'),
  ],
};

export const HOME_SERVICES_MAINTENANCE_PROFILE: VerticalProfileManifest = {
  id: 'home-services.maintenance',
  name: 'Home Services / Pool & Garden Care',
  version: '0.1.0',
  description: 'Specialized profile for Pool & Garden care requiring chemical logs, ' +
    'before/after photos, and materials inventory.',
  useCases: [ 'HOME_SERVICES', 'MAINTENANCE' ],
  modules: [
    ...HOME_SERVICES_BASE_PROFILE.modules,
    moduleRef('records', 'Records stores structured logs of pool pH levels, chemical ' +
    'dosing, and garden treatments applied.'),
    moduleRef('inventory', 'Inventory tracks the usage of physical materials (chlorine, ' +
    'mulch) across the service route.'),
  ],
};

export const HOME_SERVICES_DOMESTIC_PROFILE: VerticalProfileManifest = {
  id: 'home-services.domestic',
  name: 'Home Services / House-Keeping',
  version: '0.1.0',
  description: 'Specialized profile for House-Keeping requiring strict property access ' +
    'management and staff credentialing.',
  useCases: [ 'HOME_SERVICES', 'DOMESTIC' ],
  modules: [
    ...HOME_SERVICES_BASE_PROFILE.modules,
    moduleRef('access', 'Access securely stores client alarm codes, lockbox ' +
    'combinations, and smart-lock keys.'),
    moduleRef('credentials', 'Credentials verifies staff Police Clearances, Working With ' +
    'Children Checks, and bonded insurance.'),
  ],
};

export const WELLNESS_PRACTITIONER_PROFILE: VerticalProfileManifest = {
  id: 'wellness.practitioner',
  name: 'Wellness / Independent Practitioner',
  version: '0.1.0',
  description: 'Profile for nomadic wellness practitioners (Yoga, Somatics, ' +
    'Breathwork) requiring cross-pod scheduling and verifiable credentials.',
  useCases: [ 'WELLNESS', 'PRACTITIONER' ],
  modules: [
    moduleRef('events', 'Events schedules group classes across federated venue locations.', {
      turtle: `
        @prefix schema: <https://schema.org/> .
        <> a schema:Event ;
           schema:eventAttendanceMode schema:MixedEventAttendanceMode .
      `,
    }),
    moduleRef('bookings', 'Bookings manages 1-on-1 private sessions and consultations.'),
    moduleRef('credentials', 'Credentials publicly displays verifiable certifications and insurance.'),
    moduleRef('payments', 'Payments collects class and session fees directly to the practitioner.'),
  ],
};

export const WELLNESS_VENUE_PROFILE: VerticalProfileManifest = {
  id: 'wellness.venue',
  name: 'Wellness / Venue & Studio',
  version: '0.1.0',
  description: 'Profile for physical wellness spaces (Studios, Halls, Domes) that hire out space to practitioners.',
  useCases: [ 'WELLNESS', 'VENUE' ],
  modules: [
    moduleRef('bookings', 'Bookings handles the hiring of the physical space by practitioners.'),
    moduleRef('access', 'Access automatically issues digital lockbox codes to the ' +
    'practitioner during their hired time-slot.'),
    moduleRef('inventory', 'Inventory manages the rental of physical equipment (Yoga ' +
    'mats, Reformers).'),
    moduleRef('website-seo', 'Website SEO aggregates and renders the federated schedules ' +
    'of all visiting practitioners.'),
    moduleRef('mcp-server', 'MCP Server provides AI agents direct access to query wellness ' +
    'schedules and studio availability.'),
  ],
};

export const WELLNESS_CLINIC_PROFILE: VerticalProfileManifest = {
  id: 'wellness.clinic',
  name: 'Wellness / Multi-Disciplinary Clinic',
  version: '0.1.0',
  description: 'Composite profile for clinics that host multiple in-house modalities ' +
    'and practitioners under one brand.',
  useCases: [ 'WELLNESS', 'VENUE', 'CLINIC' ],
  modules: [
    ...WELLNESS_VENUE_PROFILE.modules,
    moduleRef('governance', 'Governance handles internal clinic policies and voting.'),
    moduleRef('social', 'Social provides an internal directory and communication ' +
    'channel for the employed practitioners.'),
    moduleRef('events', 'Events publishes the unified clinic timetable.'),
    moduleRef('payments', 'Payments acts as the central merchant of record before remitting to practitioners.'),
  ],
};

export const FOOD_ALLERGY_SAFETY_PROFILE: VerticalProfileManifest = {
  id: 'food.allergy-safety',
  name: 'Food / Allergy Safety',
  version: '0.1.0',
  description: 'Allergy safety bundle bundling ingredient declarations, consumer allergy ' +
    'profiles, allergen matching, and selective disclosure for secret recipes.',
  useCases: [ 'FOOD', 'ALLERGY', 'SAFETY' ],
  modules: [
    moduleRef('allergy-profile', 'Allergy profile manages consumer allergy/dietary ' +
    'profiles with FSANZ/EU allergen categories and dietary restrictions.'),
    moduleRef('menu', 'Menu provides the public food offer surface where allergen data is displayed.'),
    moduleRef('catalogue', 'Catalogue holds menu items linked to ingredient declarations.'),
    moduleRef('pos', 'POS integrates allergen filtering at checkout and customer-facing displays.', {
      turtle: '<> <urn:solid-server:databox:ipms#allergenFilterMode> "enforce" .',
    }),
    moduleRef('notifications', 'Notifications alerts staff when a customer with severe allergies places an order.'),
    moduleRef('credentials', 'Credentials issues allergy attestation VCs for selective disclosure of secret recipes.'),
  ],
};

export const PRINT_SHOP_PROFILE: VerticalProfileManifest = {
  id: 'print.shop',
  name: 'Print / Shop',
  version: '0.1.0',
  description: 'Print shop bundle for print service catalogue, job intake, status ' +
    'tracking, inter-org B2B print jobs with ODRL licence enforcement.',
  useCases: [ 'PRINT', 'B2B' ],
  modules: [
    moduleRef('print', 'Print shop module provides service catalogue, job intake, and status pipeline.'),
    moduleRef('quotations', 'Quotations issues quotes for print jobs before acceptance.'),
    moduleRef('payments', 'Payments handles print job invoicing and payment collection.'),
    moduleRef('delivery', 'Delivery manages delivery of finished print products to customers.'),
    moduleRef('licensing', 'Licensing enforces ODRL policies for artwork usage and deletion after fulfilment.'),
    moduleRef('website-seo', 'Website SEO publishes the print shop catalogue and services for public discovery.'),
  ],
};

export const HR_WORKFORCE_PROFILE: VerticalProfileManifest = {
  id: 'hr.workforce',
  name: 'HR / Workforce',
  version: '0.1.0',
  description: 'HR workforce bundle for employee onboarding, shift management, ' +
    'compliance tracking, payroll, and expense claims.',
  useCases: [ 'HR', 'WORKFORCE' ],
  modules: [
    moduleRef('hr', 'HR module manages onboarding, shifts, compliance, payslips, and expense claims.'),
    moduleRef('governance', 'Governance handles role bindings and approval gates for HR decisions.'),
    moduleRef('credentials', 'Credentials issues role VCs, compliance certifications, and employment verifications.'),
    moduleRef('payments', 'Payments processes payroll disbursements and expense reimbursements.'),
    moduleRef('notifications', 'Notifications delivers shift assignments, compliance ' +
    'alerts, and payslip notifications to member pods.'),
    moduleRef('driver-management', 'Driver management extends HR for delivery drivers with zone-based dispatch.'),
    moduleRef('backups', 'Password-protected encrypted backups of employee records and compliance data.'),
    moduleRef('accounting', 'Accounting export to Xero/MYOB/QuickBooks for payroll journal entries and STP reporting.'),
  ],
};

export const FOOD_TAKE_AWAY_VERTICAL_PROFILE: VerticalProfileManifest = {
  id: 'food.take-away',
  name: 'Food / Take-Away',
  version: '0.1.0',
  description: 'Take-away and delivery bundle for quick-service restaurants, food trucks, and dark kitchens.',
  useCases: [ 'FOOD' ],
  modules: [
    moduleRef('pos.ordering', 'POS handles counter and online ordering with payment integration.'),
    moduleRef('catalogue', 'Catalogue holds menu items, variants, and modifiers.'),
    moduleRef('payments', 'Payments processes checkout for online and counter orders.'),
    moduleRef('receipt', 'Receipts produce digital receipts with QR verification.'),
    moduleRef('delivery', 'Delivery manages delivery requests with routing and tracking.'),
    moduleRef('driver-management', 'Driver management handles driver registration, job offers, and dispatch.'),
    moduleRef('allergy-profile', 'Allergy safety provides allergen matching for menu items.'),
    moduleRef('tax', 'Tax computes GST/VAT on food sales.'),
    moduleRef('discounts', 'Discounts manage promo codes and happy hour specials.'),
    moduleRef('business', 'Business hours provides opening hours for pickup availability.'),
    moduleRef('website-seo', 'Website SEO publishes menu and ordering metadata for local discovery.'),
    moduleRef('barcode', 'Barcode scanner enables GS1-aware product lookup for quick-service scanning.'),
    moduleRef('eftpos', 'EFTPOS terminal integration for card payments including tap-and-go.'),
    moduleRef('backups', 'Password-protected encrypted backups of orders, menus, and financial data.'),
    moduleRef('accounting', 'Accounting export to Xero/MYOB/QuickBooks for daily sales reconciliation.'),
  ],
};

export const SPORTS_VENUE_VERTICAL_PROFILE: VerticalProfileManifest = {
  id: 'sports.venue',
  name: 'Sports / Venue',
  version: '0.1.0',
  description: 'Sports venue bundle for ticketed events, scorekeeping, referee management, and credential gates.',
  useCases: [ 'SPORT' ],
  modules: [
    moduleRef('events', 'Events models matches, tournaments, and venue programming.'),
    moduleRef('ticketing', 'Ticketing issues tickets with QR codes and seat assignments.'),
    moduleRef('access', 'Access control verifies credentials at venue entry points.'),
    moduleRef('credentials', 'Credentials issue verifiable tickets and membership cards.'),
    moduleRef('payments', 'Payments processes ticket sales and merchandise.'),
    moduleRef('receipt', 'Receipts produce ticket purchase receipts.'),
    moduleRef('tax', 'Tax computes amusement tax and GST on ticket sales.'),
    moduleRef('discounts', 'Discounts manage early-bird, group, and member discounts.'),
    moduleRef('donations', 'Donations manage fundraising campaigns for clubs and charities.'),
    moduleRef('governance', 'Governance provides approval gates for event decisions.'),
    moduleRef('profile', 'Profile manages member pods for ticket holders.'),
    moduleRef('website-seo', 'Website SEO publishes event metadata for discovery.'),
    moduleRef('barcode', 'Barcode scanner enables QR ticket scanning and merchandise lookup at venue entry.'),
    moduleRef('eftpos', 'EFTPOS terminal integration for ticket and merchandise sales at the gate.'),
    moduleRef('backups', 'Password-protected encrypted backups of ticketing, event, and financial data.'),
    moduleRef('accounting', 'Accounting export to Xero/MYOB/QuickBooks for box office reconciliation.'),
  ],
};

export const TRADES_SERVICE_VERTICAL_PROFILE: VerticalProfileManifest = {
  id: 'trades.service',
  name: 'Trades / Service',
  version: '0.1.0',
  description: 'Trades and field service bundle for jobs, work orders, bookings, and payments.',
  useCases: [ 'TRADES' ],
  modules: [
    moduleRef('jobs', 'Jobs handles work-order intake, queuing, and completion pipeline.'),
    moduleRef('bookings', 'Bookings manages service appointments and time slots.'),
    moduleRef('quotations', 'Quotations build professional quotes with line items.'),
    moduleRef('catalogue', 'Catalogue stores services and parts as schema.org offerings.'),
    moduleRef('payments', 'Payments processes invoices and on-site payment collection.'),
    moduleRef('receipt', 'Receipts produce job completion receipts.'),
    moduleRef('tax', 'Tax computes GST/VAT on services and materials.'),
    moduleRef('inventory', 'Inventory tracks parts and materials usage.'),
    moduleRef('profile', 'Profile manages customer pods and communication.'),
    moduleRef('website-seo', 'Website SEO publishes service metadata for local discovery.'),
    moduleRef('barcode', 'Barcode scanner enables GS1-aware parts lookup and inventory scanning.'),
    moduleRef('eftpos', 'EFTPOS terminal integration for on-site card payments.'),
    moduleRef('backups', 'Password-protected encrypted backups of jobs, quotes, and financial data.'),
    moduleRef('accounting', 'Accounting export to Xero/MYOB/QuickBooks for invoicing and BAS reconciliation.'),
  ],
};

export const CHARITY_NONPROFIT_VERTICAL_PROFILE: VerticalProfileManifest = {
  id: 'charity.nonprofit',
  name: 'Charity / Nonprofit',
  version: '0.1.0',
  description: 'Charity and nonprofit bundle for donations, member governance, credentials, and tax exemptions.',
  useCases: [ 'CHARITY' ],
  modules: [
    moduleRef('donations', 'Donations manage campaigns, intake, donor receipts as VCs, and transparency reporting.'),
    moduleRef('governance', 'Governance manages board resolutions, member voting, and policy approvals.'),
    moduleRef('credentials', 'Credentials issue verifiable donor receipts and membership credentials.'),
    moduleRef('concessions', 'Concessions manage eligibility for government-subsidised services.'),
    moduleRef('tax', 'Tax manages tax exemption certificates and deductible donation reports.'),
    moduleRef('profile', 'Profile manages donor and member pods with LDN communication.'),
    moduleRef('payments', 'Payments processes one-off and recurring donations.'),
    moduleRef('receipt', 'Receipts produce donation receipts with QR verification.'),
    moduleRef('website-seo', 'Website SEO publishes charity metadata and campaign pages.'),
    moduleRef('events', 'Events models fundraising events and volunteer coordination.'),
    moduleRef('social', 'Social enables community posts and campaign updates.'),
    moduleRef('backups', 'Password-protected encrypted backups of donor records and governance documents.'),
    moduleRef('accounting', 'Accounting export to Xero/MYOB/QuickBooks for grant reporting and fund accounting.'),
  ],
};

export const LIGHTHOUSE_VERTICAL_PROFILES: readonly VerticalProfileManifest[] = [
  FOOD_RESTAURANT_VERTICAL_PROFILE,
  FOOD_ALLERGY_SAFETY_PROFILE,
  HEALTH_PRIVACY_CONSENT_VERTICAL_PROFILE,
  AUTO_PORTABLE_RECORDS_VERTICAL_PROFILE,
  MEMBER_GOVERNANCE_VERTICAL_PROFILE,
  SPORTING_CLUB_BASE_PROFILE,
  SPORTING_LEAGUE_PROFILE,
  SPORTING_FACILITY_PROFILE,
  SPORTING_COMPLIANCE_PROFILE,
  GLAM_BASE_PROFILE,
  GLAM_GALLERY_MUSEUM_PROFILE,
  GLAM_LIBRARY_PROFILE,
  GLAM_ARCHIVE_PROFILE,
  GLAM_HISTORICAL_SOCIETY_PROFILE,
  HOME_SERVICES_BASE_PROFILE,
  HOME_SERVICES_MAINTENANCE_PROFILE,
  HOME_SERVICES_DOMESTIC_PROFILE,
  WELLNESS_PRACTITIONER_PROFILE,
  WELLNESS_VENUE_PROFILE,
  WELLNESS_CLINIC_PROFILE,
  PRINT_SHOP_PROFILE,
  HR_WORKFORCE_PROFILE,
  FOOD_TAKE_AWAY_VERTICAL_PROFILE,
  SPORTS_VENUE_VERTICAL_PROFILE,
  TRADES_SERVICE_VERTICAL_PROFILE,
  CHARITY_NONPROFIT_VERTICAL_PROFILE,
];

export function validateVerticalProfileBundle(
  profile: VerticalProfileManifest,
  registry: DataboxModuleRegistry,
): VerticalProfileValidationResult {
  const checked = validateVerticalProfile(profile);
  return {
    profile: checked,
    missingModules: checked.modules
      .filter((module): boolean => registry.get(module.moduleId) === undefined)
      .map((module): string => module.moduleId),
  };
}

export async function applyVerticalProfileBundle(
  profile: VerticalProfileManifest,
  registry: DataboxModuleRegistry,
  configStore?: ModuleConfigStore,
): Promise<VerticalProfileValidationResult> {
  const validation = validateVerticalProfileBundle(profile, registry);
  if (validation.missingModules.length > 0) {
    throw new Error(`Vertical profile ${validation.profile.id} references missing modules: ${
      validation.missingModules.join(', ')
    }.`);
  }

  for (const module of validation.profile.modules) {
    registry.setEnabled(module.moduleId, module.enabledByDefault);
    if (module.defaultConfig && !configStore) {
      throw new Error(`Vertical profile ${validation.profile.id} needs a ModuleConfigStore to apply RDF defaults.`);
    }
    if (configStore) {
      if (module.defaultConfig) {
        await configStore.save(module.moduleId, module.defaultConfig.turtle);
      }
      await configStore.setEnabled(module.moduleId, module.enabledByDefault);
    }
  }
  return validation;
}

export async function serializeVerticalProfileToTurtle(
  profile: VerticalProfileManifest,
  options: VerticalProfileRdfOptions = {},
): Promise<string> {
  const checked = validateVerticalProfile(profile);
  const subject = namedNode(options.subjectIri ?? defaultProfileSubject(checked.id));
  const quads: Quad[] = [
    rdfQuad(subject, RDF.terms.type, TERMS.verticalProfile),
    rdfQuad(subject, TERMS.identifier, literal(checked.id)),
    rdfQuad(subject, DC.terms.title, literal(checked.name)),
    rdfQuad(subject, TERMS.softwareVersion, literal(checked.version)),
    rdfQuad(subject, DC.terms.description, literal(checked.description)),
  ];

  addStringList(quads, subject, TERMS.useCaseList, checked.useCases);
  addModuleList(quads, subject, checked.modules);
  return serializeTurtle(quads);
}

export function parseVerticalProfileRdf(turtle: string, options: VerticalProfileRdfOptions = {}):
VerticalProfileManifest {
  let quads: Quad[];
  try {
    quads = new Parser({ baseIRI: options.baseIri }).parse(turtle);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`IPMS vertical profile RDF could not be parsed: ${message}`);
  }

  const subject = options.subjectIri ? namedNode(options.subjectIri) : findProfileSubject(quads);
  if (!hasQuad(quads, subject, RDF.terms.type, TERMS.verticalProfile)) {
    throw new Error(`IPMS vertical profile ${subject.value} must declare rdf:type ipms:VerticalProfile.`);
  }

  return validateVerticalProfile({
    id: requiredLiteral(quads, subject, TERMS.identifier, 'id'),
    name: requiredLiteral(quads, subject, DC.terms.title, 'name'),
    version: requiredLiteral(quads, subject, TERMS.softwareVersion, 'version'),
    description: requiredLiteral(quads, subject, DC.terms.description, 'description'),
    useCases: requiredStringList(quads, subject, TERMS.useCaseList, 'useCases'),
    modules: requiredModuleList(quads, subject),
  });
}

function moduleRef(
  moduleId: string,
  rationale: string,
  defaultConfig?: { readonly turtle: string },
): VerticalProfileModuleReference {
  return {
    moduleId,
    required: true,
    enabledByDefault: true,
    rationale,
    ...defaultConfig === undefined ?
        {} :
        {
          defaultConfig: {
            contentType: 'text/turtle',
            turtle: defaultConfig.turtle,
          },
        },
  };
}

function validateVerticalProfile(profile: VerticalProfileManifest): VerticalProfileManifest {
  const modules = requireArray(profile.modules, 'IPMS vertical profile modules')
    .map((module, index): VerticalProfileModuleReference => validateModuleReference(module, index));
  const seen = new Set<string>();
  for (const module of modules) {
    if (seen.has(module.moduleId)) {
      throw new Error(`IPMS vertical profile module ${module.moduleId} must be referenced only once.`);
    }
    seen.add(module.moduleId);
  }
  return {
    id: requireProfileId(profile.id, 'IPMS vertical profile id'),
    name: requireString(profile.name, 'IPMS vertical profile name'),
    version: requireString(profile.version, 'IPMS vertical profile version'),
    description: requireString(profile.description, 'IPMS vertical profile description'),
    useCases: requireStringArray(profile.useCases, 'IPMS vertical profile useCases'),
    modules,
  };
}

function validateModuleReference(value: unknown, index: number): VerticalProfileModuleReference {
  const module = requireRecord(value, `IPMS vertical profile module ${index}`);
  let defaultConfig: VerticalProfileDefaultConfig | undefined;
  if (module.defaultConfig !== undefined) {
    defaultConfig = validateDefaultConfig(module.defaultConfig, index);
  }
  return {
    moduleId: requireProfileId(module.moduleId, `IPMS vertical profile module ${index} moduleId`),
    required: requireBoolean(module.required, `IPMS vertical profile module ${index} required`),
    enabledByDefault: requireBoolean(
      module.enabledByDefault,
      `IPMS vertical profile module ${index} enabledByDefault`,
    ),
    rationale: requireString(module.rationale, `IPMS vertical profile module ${index} rationale`),
    ...defaultConfig === undefined ? {} : { defaultConfig },
  };
}

function validateDefaultConfig(value: unknown, index: number): VerticalProfileDefaultConfig {
  const config = requireRecord(value, `IPMS vertical profile module ${index} defaultConfig`);
  return {
    contentType: requireExact(
      config.contentType,
      'text/turtle',
      `IPMS vertical profile module ${index} defaultConfig contentType`,
    ),
    turtle: requireString(config.turtle, `IPMS vertical profile module ${index} defaultConfig turtle`),
  };
}

function addStringList(
  quads: Quad[],
  subject: NamedNode,
  predicate: NamedNode,
  values: readonly string[],
): void {
  if (values.length === 0) {
    quads.push(rdfQuad(subject, predicate, RDF_NIL));
    return;
  }

  const head = blankNode();
  quads.push(rdfQuad(subject, predicate, head));
  let current: BlankNode = head;
  for (const [ index, value ] of values.entries()) {
    quads.push(rdfQuad(current, RDF_FIRST, literal(value)));
    if (index === values.length - 1) {
      quads.push(rdfQuad(current, RDF_REST, RDF_NIL));
    } else {
      const next = blankNode();
      quads.push(rdfQuad(current, RDF_REST, next));
      current = next;
    }
  }
}

function addModuleList(
  quads: Quad[],
  subject: NamedNode,
  modules: readonly VerticalProfileModuleReference[],
): void {
  const nodes = modules.map((module): BlankNode => {
    const node = blankNode();
    quads.push(
      rdfQuad(node, TERMS.moduleId, literal(module.moduleId)),
      rdfQuad(node, TERMS.required, booleanLiteral(module.required)),
      rdfQuad(node, TERMS.enabledByDefault, booleanLiteral(module.enabledByDefault)),
      rdfQuad(node, TERMS.rationale, literal(module.rationale)),
    );
    if (module.defaultConfig) {
      const config = blankNode();
      quads.push(
        rdfQuad(node, TERMS.defaultConfig, config),
        rdfQuad(config, TERMS.contentType, literal(module.defaultConfig.contentType)),
        rdfQuad(config, RDF_VALUE, literal(module.defaultConfig.turtle)),
      );
    }
    return node;
  });
  addTermList(quads, subject, TERMS.moduleList, nodes);
}

function addTermList(
  quads: Quad[],
  subject: NamedNode,
  predicate: NamedNode,
  values: readonly Quad['object'][],
): void {
  if (values.length === 0) {
    quads.push(rdfQuad(subject, predicate, RDF_NIL));
    return;
  }
  const head = blankNode();
  quads.push(rdfQuad(subject, predicate, head));
  let current: BlankNode = head;
  for (const [ index, value ] of values.entries()) {
    quads.push(rdfQuad(current, RDF_FIRST, value));
    if (index === values.length - 1) {
      quads.push(rdfQuad(current, RDF_REST, RDF_NIL));
    } else {
      const next = blankNode();
      quads.push(rdfQuad(current, RDF_REST, next));
      current = next;
    }
  }
}

function requiredModuleList(quads: readonly Quad[], subject: NamedNode): VerticalProfileModuleReference[] {
  const values = objects(quads, subject, TERMS.moduleList);
  if (values.length === 0) {
    throw new Error('IPMS vertical profile modules list is required.');
  }
  if (values.length > 1) {
    throw new Error('IPMS vertical profile modules list must have exactly one value.');
  }
  return parseTermList(quads, values[0], 'modules')
    .map((node, index): VerticalProfileModuleReference => parseModuleReference(quads, node, index));
}

function parseModuleReference(quads: readonly Quad[], node: Term, index: number): VerticalProfileModuleReference {
  const defaultConfig = parseDefaultConfig(quads, node, index);
  return {
    moduleId: requiredLiteral(quads, node, TERMS.moduleId, `module ${index} moduleId`),
    required: requiredBooleanLiteral(quads, node, TERMS.required, `module ${index} required`),
    enabledByDefault: requiredBooleanLiteral(
      quads,
      node,
      TERMS.enabledByDefault,
      `module ${index} enabledByDefault`,
    ),
    rationale: requiredLiteral(quads, node, TERMS.rationale, `module ${index} rationale`),
    ...defaultConfig === undefined ? {} : { defaultConfig },
  };
}

function parseDefaultConfig(
  quads: readonly Quad[],
  node: Term,
  index: number,
): VerticalProfileDefaultConfig | undefined {
  const configs = objects(quads, node, TERMS.defaultConfig);
  if (configs.length === 0) {
    return;
  }
  if (configs.length > 1) {
    throw new Error(`IPMS vertical profile module ${index} defaultConfig must have exactly one value.`);
  }
  return {
    contentType: requireExact(
      requiredLiteral(quads, configs[0], TERMS.contentType, `module ${index} defaultConfig contentType`),
      'text/turtle',
      `IPMS vertical profile module ${index} defaultConfig contentType`,
    ),
    turtle: requiredLiteral(quads, configs[0], RDF_VALUE, `module ${index} defaultConfig turtle`),
  };
}

function requiredStringList(quads: readonly Quad[], subject: NamedNode, predicate: NamedNode, field: string): string[] {
  const values = objects(quads, subject, predicate);
  if (values.length === 0) {
    throw new Error(`IPMS vertical profile ${field} list is required.`);
  }
  if (values.length > 1) {
    throw new Error(`IPMS vertical profile ${field} list must have exactly one value.`);
  }
  return parseTermList(quads, values[0], field).map((value): string => {
    if (value.termType !== 'Literal') {
      throw new Error(`IPMS vertical profile ${field} list entries must be literals.`);
    }
    return requireString(value.value, `IPMS vertical profile ${field} list entry`);
  });
}

function parseTermList(quads: readonly Quad[], head: Term, field: string): Term[] {
  const values: Term[] = [];
  const seen = new Set<string>();
  let current = head;
  while (!termEquals(current, RDF_NIL)) {
    const key = termKey(current);
    if (seen.has(key)) {
      throw new Error(`IPMS vertical profile ${field} list must not contain a cycle.`);
    }
    seen.add(key);
    const first = objects(quads, current, RDF_FIRST);
    const rest = objects(quads, current, RDF_REST);
    if (first.length !== 1 || rest.length !== 1) {
      throw new Error(`IPMS vertical profile ${field} list must be a well-formed RDF list.`);
    }
    values.push(first[0]);
    current = rest[0];
  }
  return values;
}

function findProfileSubject(quads: readonly Quad[]): NamedNode {
  const subjects = quads
    .filter((candidate): boolean => termEquals(candidate.predicate, RDF.terms.type) &&
      termEquals(candidate.object, TERMS.verticalProfile))
    .map((candidate): Term => candidate.subject);
  const unique = uniqueTerms(subjects);
  if (unique.length === 0) {
    throw new Error('IPMS vertical profile RDF must contain one rdf:type ipms:VerticalProfile subject.');
  }
  if (unique.length > 1) {
    throw new Error('IPMS vertical profile RDF must contain exactly one rdf:type ipms:VerticalProfile subject.');
  }
  if (unique[0].termType !== 'NamedNode') {
    throw new Error('IPMS vertical profile subject must be a named node.');
  }
  return unique[0];
}

function requiredLiteral(quads: readonly Quad[], subject: Term, predicate: NamedNode, field: string): string {
  const values = objects(quads, subject, predicate);
  if (values.length === 0) {
    throw new Error(`IPMS vertical profile ${field} is required.`);
  }
  if (values.length > 1) {
    throw new Error(`IPMS vertical profile ${field} must have exactly one value.`);
  }
  if (values[0].termType !== 'Literal') {
    throw new Error(`IPMS vertical profile ${field} must be a literal.`);
  }
  return values[0].value;
}

function requiredBooleanLiteral(quads: readonly Quad[], subject: Term, predicate: NamedNode, field: string): boolean {
  const value = requiredLiteral(quads, subject, predicate, field);
  if (value !== 'true' && value !== 'false') {
    throw new Error(`IPMS vertical profile ${field} must be a boolean literal.`);
  }
  return value === 'true';
}

function hasQuad(quads: readonly Quad[], subject: Term, predicate: NamedNode, object: Term): boolean {
  return quads.some((candidate): boolean => termEquals(candidate.subject, subject) &&
    termEquals(candidate.predicate, predicate) &&
    termEquals(candidate.object, object));
}

function objects(quads: readonly Quad[], subject: Term, predicate: NamedNode): Term[] {
  return quads
    .filter((candidate): boolean =>
      termEquals(candidate.subject, subject) && termEquals(candidate.predicate, predicate))
    .map((candidate): Term => candidate.object);
}

function uniqueTerms(terms: Term[]): Term[] {
  const seen = new Set<string>();
  return terms.filter((term): boolean => {
    const key = termKey(term);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function termEquals(left: Term, right: Term): boolean {
  return left.termType === right.termType && left.value === right.value;
}

function termKey(term: Term): string {
  return `${term.termType}:${term.value}`;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${field} must be an array.`);
  }
  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  return requireArray(value, field).map((entry, index): string => requireString(entry, `${field}[${index}]`));
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

function requireProfileId(value: unknown, field: string): string {
  const id = requireString(value, field);
  if (!/^[\w.:-]+$/u.test(id)) {
    throw new Error(`${field} must be a safe id.`);
  }
  return id;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${field} must be a boolean.`);
  }
  return value;
}

function requireExact<T extends string>(value: unknown, expected: T, field: string): T {
  if (value !== expected) {
    throw new Error(`${field} must be ${expected}.`);
  }
  return expected;
}

function defaultProfileSubject(id: string): string {
  return `urn:solid-server:databox:ipms:vertical-profile:${encodeURIComponent(id)}`;
}

function blankNode(): BlankNode {
  return DataFactory.blankNode();
}

function literal(value: string): Literal {
  return DataFactory.literal(value);
}

function booleanLiteral(value: boolean): Literal {
  return DataFactory.literal(value ? 'true' : 'false', namedNode(`${XSD}boolean`));
}

function namedNode(value: string): NamedNode {
  return DataFactory.namedNode(value);
}

function rdfQuad(subject: Quad['subject'], predicate: Quad['predicate'], object: Quad['object']): Quad {
  return DataFactory.quad(subject, predicate, object);
}

async function serializeTurtle(quads: Quad[]): Promise<string> {
  const writer = new Writer({
    prefixes: {
      ipms: namedNode(IPMS.namespace),
      dcterms: namedNode(DC.namespace),
      rdf: namedNode(RDF.namespace),
      schema: namedNode(SCHEMA),
      xsd: namedNode(XSD),
    },
  });
  writer.addQuads(quads);
  return new Promise((resolve, reject): void => {
    writer.end((error, result): void => {
      if (error) {
        reject(error);
      } else {
        resolve(typeof result === 'string' ? result : '');
      }
    });
  });
}
