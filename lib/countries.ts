export interface Country {
  name: {
    common: string;
  };
  capital?: string[];
  population?: number;
  region?: string;
  flags?: {
    svg?: string;
  };
}

export interface ExpandedCountry extends Country {
  detailedInfo: Record<string, string>;
  statistics: Array<{
    year: number;
    metric: string;
    value: number;
    category: string;
    description: string;
  }>;
  metadata: {
    lastUpdated: string;
    dataSource: string;
    version: string;
    additionalFields: Array<{
      field: string;
      value: string;
      type: string;
    }>;
  };
}

function expandCountryData(country: Country): ExpandedCountry {
  return {
    ...country,
    detailedInfo: {
      description: `Comprehensive information about ${country.name.common}`,
      history: `Historical data and background information for ${country.name.common}`,
      geography: `Geographical details including terrain, climate, and natural resources`,
      economy: `Economic indicators, trade information, and financial data`,
      culture: `Cultural heritage, traditions, and social customs`,
      government: `Government structure, political system, and administrative divisions`,
      infrastructure: `Transportation networks, communication systems, and utilities`,
      education: `Education system, literacy rates, and academic institutions`,
      healthcare: `Healthcare system, medical facilities, and public health data`,
      tourism: `Tourist attractions, travel information, and hospitality sector`,
      technology: `Technology sector, innovation index, and digital infrastructure`,
    },
    statistics: Array.from({ length: 100 }, (_, i) => ({
      year: 2020 + (i % 5),
      metric: `metric_${i}`,
      value: Math.random() * 1000000,
      category: ["economic", "social", "environmental", "political"][i % 4],
      description: `Statistical data point ${i} for ${country.name.common}`,
    })),
    metadata: {
      lastUpdated: new Date().toISOString(),
      dataSource: "REST Countries API",
      version: "3.1",
      additionalFields: Array.from({ length: 50 }, (_, i) => ({
        field: `custom_field_${i}`,
        value: `Value ${i} for ${country.name.common}`,
        type: ["string", "number", "boolean", "object"][i % 4],
      })),
    },
  };
}

export async function fetchCountriesData(): Promise<ExpandedCountry[]> {
  console.log("[fetchCountriesData] - Fetching countries data...");
  const response = await fetch(
    "https://restcountries.com/v3.1/all?fields=name,capital,currencies,languages,population,area,region,subregion,timezones,flags",
    {
      next: {
        revalidate: 0,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch countries: ${response.statusText}`);
  }

  const countries = (await response.json()) as Country[];

  const expandedCountries = countries.map(expandCountryData);

  return expandedCountries;
}
