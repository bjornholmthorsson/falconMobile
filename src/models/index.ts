export interface User {
  id: string;
  displayName: string;
  jobTitle: string | null;
  userPrincipalName: string;
  mobilePhone: string | null;
  businessPhone: string | null;
  officeLocation: string | null;
  department: string | null;
  emailAddress: string | null;
  managerId: string | null;
  accountEnabled: boolean;
}

export interface Employee {
  userId: string;
  name: string;
  title: string | null;
  mobilePhone: string | null;
  userPrincipalName: string | null;
  location: string;
  lastKnownLocation: string;
  locationChanged: Date | null;
  teamsAvailability: string;
  teamsActivity: string;
  statusImage: TeamsStatus;
  absence: string | null;
  absenceKey: string | null;
  absenceComment: string | null;
  absenceImage: AbsenceType | null;
  photo: string | null; // base64 URI
}

export interface UserLocation {
  id: string;
  username: string;
  location: string;
  lastUpdated: string; // ISO date string
}

export interface KnownLocation {
  id: string;
  clientName: string;
  location: {
    coordinates: [number, number]; // [lat, lon]
  };
  distance?: number;
}

export interface UserAbsence {
  id: string;
  currentDate: string;
  absenceStartTime: string;
  absenceEndTime: string;
  userId: string;
  userName: string;
  sourceKey: string;
  absenceKey: string;
  comment: string;
  entryDate: string;
}

export interface UserAbsenceRegistration {
  sourceKey: string;
  absenceKey: string;
  absenceStartTime: string; // ISO
  absenceEndTime: string;   // ISO
  userId: string;
  userName: string;
  comment: string;
}

export interface Absence {
  id: string;
  absenceKey: string;
  name: string;
  entryDate: string;
  entryBy: string;
}

export interface UserData {
  userId: string;
  status: string | null;
  mobile: string | null;
  spouse: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  ssn: string | null;
  education: string | null;
  role: string | null;
  startDate: string | null;
  entryDate: string;
  entryBy: string | null;
}

export interface TeamsPresence {
  id: string;
  availability: string;
  activity: string;
}

export interface HistoricalLocation {
  timestamp: string;
  location: string;
}

export type TeamsStatus =
  | 'available'
  | 'away'
  | 'busy'
  | 'out_of_office'
  | 'do_not_disturb'
  | 'offline'
  | 'unknown';

export type AbsenceType =
  | 'HOLIDAY'
  | 'SICK'
  | 'SICK_CHILD'
  | 'DOCTOR'
  | 'OTHER';

export interface OfficeSummary {
  office: string;
  busy: number;
  available: number;
  away: number;
  offline: number;
}

export interface LunchOption {
  category: string;
  description: string;
}

export interface LunchDay {
  id: number;
  dayOfWeek: string;
  date: string;
  holiday: string | null;
  options: LunchOption[];
}

export interface LunchWeek {
  id: number;
  year: number;
  weekNumber: number;
  restaurant: string | null;
  priceIsk: number | null;
  subsidyPct: number;
  dateLabel: string | null;
  days: LunchDay[];
}
