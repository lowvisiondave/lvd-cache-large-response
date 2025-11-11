import Image from "next/image";
import { createChunkedCache } from "@/lib/chunkedCache";
import { type Country, fetchCountriesData } from "@/lib/countries";

export const dynamic = "force-dynamic";

const countriesCache = createChunkedCache(
  "rest-countries-all",
  fetchCountriesData,
  3600,
);

export default async function Home() {
  const countries = await countriesCache.get();

  const totalCountries = countries.length;
  const totalPopulation = countries.reduce(
    (sum: number, country: Country) => sum + (country.population || 0),
    0,
  );
  const regions = new Set(
    countries.map((country: Country) => country.region).filter(Boolean),
  );

  return (
    <main className="min-h-screen p-8 bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-2 text-gray-900">
          Chunked Cache Demo
        </h1>
        <p className="text-gray-600 mb-8">
          This page demonstrates caching large API responses (over 2MB) using
          Next.js chunked caching strategy.
        </p>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">
            REST Countries API Data
          </h2>
          <p className="text-gray-600 mb-4">
            Data fetched from{" "}
            <a
              href="https://restcountries.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              restcountries.com
            </a>{" "}
            and cached using chunked cache (response size: ~2-3MB)
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Total Countries</div>
              <div className="text-3xl font-bold text-blue-700">
                {totalCountries.toLocaleString()}
              </div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Total Population</div>
              <div className="text-3xl font-bold text-green-700">
                {(totalPopulation / 1_000_000_000).toFixed(2)}B
              </div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Regions</div>
              <div className="text-3xl font-bold text-purple-700">
                {regions.size}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">
            Sample Countries
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {countries.slice(0, 6).map((country: Country) => (
              <div
                key={country.name.common}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3 mb-2">
                  {country.flags?.svg && (
                    <Image
                      src={country.flags.svg}
                      alt={`${country.name.common} flag`}
                      width={32}
                      height={24}
                      className="object-cover rounded"
                    />
                  )}
                  <h3 className="font-semibold text-lg text-gray-900">
                    {country.name.common}
                  </h3>
                </div>
                <div className="text-sm text-gray-600 space-y-1">
                  {country.capital && (
                    <div>
                      <span className="font-medium">Capital:</span>{" "}
                      {country.capital[0]}
                    </div>
                  )}
                  {country.population && (
                    <div>
                      <span className="font-medium">Population:</span>{" "}
                      {country.population.toLocaleString()}
                    </div>
                  )}
                  {country.region && (
                    <div>
                      <span className="font-medium">Region:</span>{" "}
                      {country.region}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 text-sm text-gray-500">
          <p>
            💡 <strong>How it works:</strong> The API response is automatically
            split into chunks under 2MB each, stored separately in Next.js
            cache, and reassembled on subsequent requests. This allows caching
            responses larger than Next.js's 2MB limit.
          </p>
        </div>
      </div>
    </main>
  );
}
