export interface CategoryItem {
  id: string;
  name: string;
  parent: string | null;
  description?: string;
}

export const CATEGORIES_CONFIG: CategoryItem[] = [
  {
    id: "groceries",
    name: "Groceries",
    parent: null,
    description: "Supermarkets, produce, and household food supplies"
  },
  {
    id: "dining",
    name: "Dining",
    parent: null,
    description: "Restaurants, cafes, bakeries, coffee shops, and takeout"
  },
  {
    id: "housing-mortgage",
    name: "Housing:Mortgage",
    parent: "Housing",
    description: "Monthly mortgage principal and interest payments"
  },
  {
    id: "housing-property-tax",
    name: "Housing:Property Tax",
    parent: "Housing",
    description: "County and municipal real estate property tax assessments"
  },
  {
    id: "housing-maintenance",
    name: "Housing:Maintenance",
    parent: "Housing",
    description: "Home repairs, hardware supplies, plumbing, and contractor services"
  },
  {
    id: "utilities",
    name: "Utilities",
    parent: null,
    description: "Electric, gas, municipal water, internet, and mobile phone bills"
  },
  {
    id: "transportation-fuel",
    name: "Transportation:Fuel",
    parent: "Transportation",
    description: "Gasoline, diesel, and EV charging stations"
  },
  {
    id: "transportation-car-maintenance",
    name: "Transportation:Car Maintenance",
    parent: "Transportation",
    description: "Vehicle repairs, oil changes, tires, and maintenance"
  },
  {
    id: "transportation-transit",
    name: "Transportation:Transit",
    parent: "Transportation",
    description: "Public transportation, commuter rail, subways, and ridesharing"
  },
  {
    id: "childcare-school",
    name: "Childcare:School",
    parent: "Childcare",
    description: "School tuition, preschool programs, and daycare services"
  },
  {
    id: "childcare-sports",
    name: "Childcare:Sports",
    parent: "Childcare",
    description: "Youth sports leagues, swimming, martial arts, and gymnastics"
  },
  {
    id: "childcare-extra-curricular",
    name: "Childcare:Extra-Curricular",
    parent: "Childcare",
    description: "Music lessons, art classes, STEM camps, dance, and scouts"
  },
  {
    id: "entertainment",
    name: "Entertainment",
    parent: null,
    description: "Streaming subscriptions, cinema, events, gaming, and digital entertainment"
  },
  {
    id: "shopping",
    name: "Shopping",
    parent: null,
    description: "General merchandise, department stores, clothing, and electronics"
  },
  {
    id: "healthcare",
    name: "Healthcare",
    parent: null,
    description: "Doctor visits, dental, vision, prescriptions, and wellness"
  },
  {
    id: "travel",
    name: "Travel",
    parent: null,
    description: "Flights, lodging, car rentals, and vacation travel"
  },
  {
    id: "income-paycheck",
    name: "Income:Paycheck",
    parent: "Income",
    description: "Employer payroll, salaries, and direct deposit income"
  },
  {
    id: "transfer-cc-payment",
    name: "Transfer:CreditCardPayment",
    parent: "Transfer",
    description: "Internal balance transfers and credit card bill payments"
  },
  {
    id: "uncategorized",
    name: "Uncategorized",
    parent: null,
    description: "Transactions requiring human triage or rule creation"
  }
];

export const DEFAULT_CATEGORIES: string[] = CATEGORIES_CONFIG.map(c => c.name);
