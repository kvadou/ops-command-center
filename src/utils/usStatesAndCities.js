// Lightweight replacement for country-state-city package
// Only includes US states and major cities to reduce bundle size from 8.32 MB to ~50 KB

export const US_STATES = [
  { isoCode: "AL", name: "Alabama" },
  { isoCode: "AK", name: "Alaska" },
  { isoCode: "AZ", name: "Arizona" },
  { isoCode: "AR", name: "Arkansas" },
  { isoCode: "CA", name: "California" },
  { isoCode: "CO", name: "Colorado" },
  { isoCode: "CT", name: "Connecticut" },
  { isoCode: "DE", name: "Delaware" },
  { isoCode: "FL", name: "Florida" },
  { isoCode: "GA", name: "Georgia" },
  { isoCode: "HI", name: "Hawaii" },
  { isoCode: "ID", name: "Idaho" },
  { isoCode: "IL", name: "Illinois" },
  { isoCode: "IN", name: "Indiana" },
  { isoCode: "IA", name: "Iowa" },
  { isoCode: "KS", name: "Kansas" },
  { isoCode: "KY", name: "Kentucky" },
  { isoCode: "LA", name: "Louisiana" },
  { isoCode: "ME", name: "Maine" },
  { isoCode: "MD", name: "Maryland" },
  { isoCode: "MA", name: "Massachusetts" },
  { isoCode: "MI", name: "Michigan" },
  { isoCode: "MN", name: "Minnesota" },
  { isoCode: "MS", name: "Mississippi" },
  { isoCode: "MO", name: "Missouri" },
  { isoCode: "MT", name: "Montana" },
  { isoCode: "NE", name: "Nebraska" },
  { isoCode: "NV", name: "Nevada" },
  { isoCode: "NH", name: "New Hampshire" },
  { isoCode: "NJ", name: "New Jersey" },
  { isoCode: "NM", name: "New Mexico" },
  { isoCode: "NY", name: "New York" },
  { isoCode: "NC", name: "North Carolina" },
  { isoCode: "ND", name: "North Dakota" },
  { isoCode: "OH", name: "Ohio" },
  { isoCode: "OK", name: "Oklahoma" },
  { isoCode: "OR", name: "Oregon" },
  { isoCode: "PA", name: "Pennsylvania" },
  { isoCode: "RI", name: "Rhode Island" },
  { isoCode: "SC", name: "South Carolina" },
  { isoCode: "SD", name: "South Dakota" },
  { isoCode: "TN", name: "Tennessee" },
  { isoCode: "TX", name: "Texas" },
  { isoCode: "UT", name: "Utah" },
  { isoCode: "VT", name: "Vermont" },
  { isoCode: "VA", name: "Virginia" },
  { isoCode: "WA", name: "Washington" },
  { isoCode: "WV", name: "West Virginia" },
  { isoCode: "WI", name: "Wisconsin" },
  { isoCode: "WY", name: "Wyoming" },
  { isoCode: "DC", name: "District of Columbia" }
];

// Major US cities by state (top 10-20 cities per state to keep size manageable)
export const US_CITIES = {
  AL: ["Birmingham", "Montgomery", "Mobile", "Huntsville", "Tuscaloosa", "Hoover", "Dothan", "Auburn", "Decatur", "Madison"],
  AK: ["Anchorage", "Fairbanks", "Juneau", "Sitka", "Ketchikan", "Wasilla", "Kenai", "Kodiak", "Bethel", "Palmer"],
  AZ: ["Phoenix", "Tucson", "Mesa", "Chandler", "Scottsdale", "Glendale", "Gilbert", "Tempe", "Peoria", "Surprise", "Yuma", "Avondale", "Flagstaff", "Goodyear", "Buckeye"],
  AR: ["Little Rock", "Fort Smith", "Fayetteville", "Springdale", "Jonesboro", "North Little Rock", "Conway", "Rogers", "Pine Bluff", "Bentonville"],
  CA: ["Los Angeles", "San Diego", "San Jose", "San Francisco", "Fresno", "Sacramento", "Long Beach", "Oakland", "Bakersfield", "Anaheim", "Santa Ana", "Riverside", "Stockton", "Irvine", "Chula Vista", "Fremont", "San Bernardino", "Modesto", "Fontana", "Oxnard", "Moreno Valley", "Huntington Beach", "Glendale", "Santa Clarita", "Garden Grove", "Oceanside", "Rancho Cucamonga", "Santa Rosa", "Ontario", "Lancaster", "Elk Grove", "Corona", "Palmdale", "Salinas", "Pomona", "Hayward", "Escondido", "Torrance", "Sunnyvale", "Orange", "Fullerton", "Pasadena", "Thousand Oaks", "Visalia", "Simi Valley", "Concord", "Roseville", "Victorville", "Santa Clara", "Vallejo", "Berkeley", "El Monte", "Downey", "Costa Mesa", "Inglewood", "Carlsbad", "San Buenaventura", "Fairfield", "West Covina", "Murrieta", "Richmond", "Norwalk", "Antioch", "Temecula", "Burbank", "Daly City", "Rialto", "Santa Maria", "El Cajon", "San Mateo", "Clovis", "Compton", "Jurupa Valley", "Vista", "South Gate", "Mission Viejo", "Vacaville", "Carson", "Hesperia", "Santa Monica", "Westminster", "Redding", "Santa Barbara", "Chico", "Newport Beach", "San Leandro", "San Marcos", "Whittier", "Hawthorne", "Citrus Heights", "Tracy", "Alhambra", "Livermore", "Buena Park", "Menifee", "Hemet", "Lakewood", "Merced", "Chino", "Indio", "Redwood City", "Lake Forest", "Napa", "Tustin", "Bellflower", "Mountain View", "Chino Hills", "Baldwin Park", "Alameda", "Upland", "San Ramon", "Folsom", "Pleasanton", "Union City", "Perris", "Manteca", "Lynwood", "Apple Valley", "Redlands", "Turlock", "Milpitas", "Redondo Beach", "Rancho Cordova", "Yorba Linda", "Palo Alto", "Davis", "Camarillo", "Walnut Creek", "Pittsburg", "South San Francisco", "Yuba City", "San Clemente", "Laguna Niguel", "Pico Rivera", "Montebello", "Lodi", "Madera", "Santa Cruz", "La Habra", "Encinitas", "Monterey Park", "Tulare", "Cupertino", "Gardena", "National City", "Rocklin", "Petaluma", "Huntington Park", "San Rafael", "La Mesa", "Arcadia", "Fountain Valley", "Diamond Bar", "Woodland", "Santee", "Lake Elsinore", "Porterville", "Paramount", "Eastvale", "Rosemead", "Hanford", "Highland", "Brentwood", "Novato", "Colton", "Cathedral City", "Delano", "Yucaipa", "Watsonville", "Placentia", "Glendora", "Gilroy", "Palm Desert", "Cerritos", "West Sacramento", "Aliso Viejo", "Poway", "La Mirada", "Rancho Santa Margarita", "Cypress", "Dublin", "Covina", "Azusa", "La Puente", "Diamond Bar", "Manhattan Beach", "Santee", "San Gabriel"],
  CO: ["Denver", "Colorado Springs", "Aurora", "Fort Collins", "Lakewood", "Thornton", "Arvada", "Westminster", "Pueblo", "Centennial", "Boulder", "Greeley", "Longmont", "Loveland", "Grand Junction"],
  CT: ["Bridgeport", "New Haven", "Stamford", "Hartford", "Waterbury", "Norwalk", "Danbury", "New Britain", "West Hartford", "Greenwich"],
  DE: ["Wilmington", "Dover", "Newark", "Middletown", "Smyrna", "Milford", "Seaford", "Georgetown", "Elsmere", "New Castle"],
  FL: ["Jacksonville", "Miami", "Tampa", "Eastside", "St. Petersburg", "Hialeah", "Tallahassee", "Fort Lauderdale", "Port St. Lucie", "Cape Coral", "Pembroke Pines", "Hollywood", "Miramar", "Coral Springs", "Clearwater", "Miami Gardens", "Palm Bay", "Pompano Beach", "West Palm Beach", "Lakeland", "Davie", "Miami Beach", "Sunrise", "Plantation", "Boca Raton", "Deltona", "Largo", "Deerfield Beach", "Palm Coast", "Melbourne", "Boynton Beach", "Lauderhill", "Weston", "Fort Myers", "Kissimmee", "Homestead", "Tamarac", "Delray Beach", "Daytona Beach", "North Miami", "Wellington", "North Port", "Jupiter", "Ocala", "Port Orange", "Margate", "Coconut Creek", "Sanford", "Sarasota", "Pensacola", "Bradenton", "Palm Beach Gardens", "Pinellas Park", "Coral Gables", "Doral", "Bonita Springs", "Apopka", "Titusville", "North Miami Beach", "Oakland Park", "Fort Pierce", "North Lauderdale", "Cutler Bay", "Altamonte Springs", "St. Cloud", "Greenacres", "Ormond Beach", "Ocoee", "Hallandale Beach", "Winter Garden", "Aventura"],
  GA: ["Atlanta", "Augusta", "Columbus", "Macon", "Savannah", "Athens", "Sandy Springs", "Roswell", "Johns Creek", "Albany", "Warner Robins", "Alpharetta", "Marietta", "Valdosta", "Smyrna"],
  HI: ["Honolulu", "Pearl City", "Hilo", "Kailua", "Waipahu", "Kaneohe", "Mililani Town", "Kahului", "Ewa Gentry", "Mililani Mauka"],
  ID: ["Boise", "Meridian", "Nampa", "Idaho Falls", "Pocatello", "Caldwell", "Coeur d'Alene", "Twin Falls", "Lewiston", "Post Falls"],
  IL: ["Chicago", "Aurora", "Naperville", "Joliet", "Rockford", "Springfield", "Elgin", "Peoria", "Champaign", "Waukegan", "Cicero", "Bloomington", "Arlington Heights", "Evanston", "Decatur", "Schaumburg", "Bolingbrook", "Palatine", "Skokie", "Des Plaines"],
  IN: ["Indianapolis", "Fort Wayne", "Evansville", "South Bend", "Carmel", "Bloomington", "Fishers", "Hammond", "Gary", "Muncie", "Lafayette", "Terre Haute", "Kokomo", "Anderson", "Noblesville"],
  IA: ["Des Moines", "Cedar Rapids", "Davenport", "Sioux City", "Iowa City", "Waterloo", "Council Bluffs", "Ames", "West Des Moines", "Dubuque"],
  KS: ["Wichita", "Overland Park", "Kansas City", "Olathe", "Topeka", "Lawrence", "Shawnee", "Manhattan", "Lenexa", "Salina"],
  KY: ["Louisville", "Lexington", "Bowling Green", "Owensboro", "Covington", "Richmond", "Georgetown", "Florence", "Hopkinsville", "Nicholasville"],
  LA: ["New Orleans", "Baton Rouge", "Shreveport", "Lafayette", "Lake Charles", "Kenner", "Bossier City", "Monroe", "Alexandria", "Houma"],
  ME: ["Portland", "Lewiston", "Bangor", "South Portland", "Auburn", "Biddeford", "Sanford", "Saco", "Augusta", "Westbrook"],
  MD: ["Baltimore", "Columbia", "Germantown", "Silver Spring", "Waldorf", "Glen Burnie", "Frederick", "Rockville", "Gaithersburg", "Bowie"],
  MA: ["Boston", "Worcester", "Springfield", "Cambridge", "Lowell", "Brockton", "Quincy", "Lynn", "New Bedford", "Fall River", "Newton", "Lawrence", "Somerville", "Framingham", "Haverhill", "Waltham", "Malden", "Brookline", "Plymouth", "Medford"],
  MI: ["Detroit", "Grand Rapids", "Warren", "Sterling Heights", "Ann Arbor", "Lansing", "Flint", "Dearborn", "Livonia", "Clinton Township", "Canton", "Westland", "Troy", "Farmington Hills", "Macomb", "Kalamazoo", "Shelby", "Wyoming", "Southfield", "Rochester Hills"],
  MN: ["Minneapolis", "St. Paul", "Rochester", "Duluth", "Bloomington", "Brooklyn Park", "Plymouth", "St. Cloud", "Eagan", "Woodbury", "Maple Grove", "Eden Prairie", "Coon Rapids", "Burnsville", "Blaine"],
  MS: ["Jackson", "Gulfport", "Southaven", "Hattiesburg", "Biloxi", "Meridian", "Tupelo", "Olive Branch", "Greenville", "Horn Lake"],
  MO: ["Kansas City", "St. Louis", "Springfield", "Columbia", "Independence", "Lee's Summit", "O'Fallon", "St. Joseph", "St. Charles", "St. Peters", "Blue Springs", "Florissant", "Joplin", "Chesterfield", "Jefferson City"],
  MT: ["Billings", "Missoula", "Great Falls", "Bozeman", "Butte", "Helena", "Kalispell", "Havre", "Anaconda", "Miles City"],
  NE: ["Omaha", "Lincoln", "Bellevue", "Grand Island", "Kearney", "Fremont", "Hastings", "North Platte", "Norfolk", "Columbus"],
  NV: ["Las Vegas", "Henderson", "Reno", "North Las Vegas", "Sparks", "Carson City", "Fernley", "Elko", "Mesquite", "Boulder City"],
  NH: ["Manchester", "Nashua", "Concord", "Derry", "Rochester", "Salem", "Dover", "Merrimack", "Londonderry", "Hudson"],
  NJ: ["Newark", "Jersey City", "Paterson", "Elizabeth", "Edison", "Woodbridge", "Lakewood", "Toms River", "Hamilton", "Trenton", "Clifton", "Camden", "Brick", "Cherry Hill", "Passaic"],
  NM: ["Albuquerque", "Las Cruces", "Rio Rancho", "Santa Fe", "Roswell", "Farmington", "Clovis", "Hobbs", "Alamogordo", "Carlsbad"],
  NY: ["New York", "Buffalo", "Rochester", "Yonkers", "Syracuse", "Albany", "New Rochelle", "Mount Vernon", "Schenectady", "Utica", "White Plains", "Hempstead", "Troy", "Niagara Falls", "Binghamton", "Freeport", "Valley Stream"],
  NC: ["Charlotte", "Raleigh", "Greensboro", "Durham", "Winston-Salem", "Fayetteville", "Cary", "Wilmington", "High Point", "Greenville", "Asheville", "Concord", "Gastonia", "Jacksonville", "Chapel Hill"],
  ND: ["Fargo", "Bismarck", "Grand Forks", "Minot", "West Fargo", "Williston", "Dickinson", "Mandan", "Jamestown", "Wahpeton"],
  OH: ["Columbus", "Cleveland", "Cincinnati", "Toledo", "Akron", "Dayton", "Parma", "Canton", "Youngstown", "Lorain", "Hamilton", "Springfield", "Kettering", "Elyria", "Lakewood"],
  OK: ["Oklahoma City", "Tulsa", "Norman", "Broken Arrow", "Lawton", "Edmond", "Moore", "Midwest City", "Enid", "Stillwater"],
  OR: ["Portland", "Salem", "Eugene", "Gresham", "Hillsboro", "Beaverton", "Bend", "Medford", "Springfield", "Corvallis", "Albany", "Tigard", "Lake Oswego", "Keizer", "Grants Pass"],
  PA: ["Philadelphia", "Pittsburgh", "Allentown", "Erie", "Reading", "Scranton", "Bethlehem", "Lancaster", "Harrisburg", "Altoona", "York", "State College", "Wilkes-Barre"],
  RI: ["Providence", "Warwick", "Cranston", "Pawtucket", "East Providence", "Woonsocket", "Coventry", "Cumberland", "North Providence", "South Kingstown"],
  SC: ["Columbia", "Charleston", "North Charleston", "Mount Pleasant", "Rock Hill", "Greenville", "Summerville", "Sumter", "Goose Creek", "Hilton Head Island"],
  SD: ["Sioux Falls", "Rapid City", "Aberdeen", "Brookings", "Watertown", "Mitchell", "Yankton", "Pierre", "Huron", "Vermillion"],
  TN: ["Westside", "Memphis", "Knoxville", "Chattanooga", "Clarksville", "Murfreesboro", "Franklin", "Jackson", "Johnson City", "Bartlett", "Hendersonville", "Kingsport", "Collierville", "Cleveland", "Smyrna"],
  TX: ["Houston", "San Antonio", "Dallas", "Austin", "Fort Worth", "El Paso", "Arlington", "Corpus Christi", "Plano", "Laredo", "Lubbock", "Garland", "Irving", "Amarillo", "Grand Prairie", "McKinney", "Frisco", "Brownsville", "Pasadena", "Mesquite", "Killeen", "McAllen", "Waco", "Carrollton", "Pearland", "Denton", "Midland", "Abilene", "Beaumont", "Round Rock", "Odessa", "Wichita Falls", "Richardson", "Lewisville", "Tyler", "College Station", "San Angelo", "Allen", "League City", "Sugar Land", "Longview", "Edinburg", "Mission", "Bryan", "Baytown", "Pharr", "Temple", "Missouri City", "Flower Mound", "Harlingen", "North Richland Hills", "Victoria", "Conroe", "New Braunfels", "Mansfield", "Cedar Park", "Rowlett", "Port Arthur", "Euless", "Georgetown", "Pflugerville", "DeSoto", "San Marcos", "Grapevine", "Bedford", "Galveston", "Cedar Hill", "Texas City", "Wylie", "Haltom City", "Keller", "Coppell", "Rockwall", "Huntsville", "Duncanville", "Sherman", "The Colony", "Burleson", "Hurst", "Lancaster", "Texarkana", "Friendswood", "Weslaco"],
  UT: ["Salt Lake City", "West Valley City", "Provo", "West Jordan", "Orem", "Sandy", "Ogden", "St. George", "Layton", "South Jordan", "Lehi", "Millcreek", "Taylorsville", "Logan", "Murray"],
  VT: ["Burlington", "South Burlington", "Rutland", "Barre", "Montpelier", "Winooski", "St. Albans", "Newport", "Vergennes", "St. Johnsbury"],
  VA: ["Virginia Beach", "Norfolk", "Chesapeake", "Richmond", "Newport News", "Alexandria", "Hampton", "Roanoke", "Portsmouth", "Suffolk", "Lynchburg", "Harrisonburg", "Leesburg", "Charlottesville", "Blacksburg"],
  WA: ["Seattle", "Spokane", "Tacoma", "Vancouver", "Bellevue", "Kent", "Everett", "Renton", "Yakima", "Federal Way", "Spokane Valley", "Bellingham", "Kennewick", "Auburn", "Pasco", "Marysville", "Lakewood", "Redmond", "Shoreline", "Richland"],
  WV: ["Charleston", "Huntington", "Morgantown", "Parkersburg", "Wheeling", "Weirton", "Fairmont", "Martinsburg", "Beckley", "Clarksburg"],
  WI: ["Milwaukee", "Madison", "Green Bay", "Kenosha", "Racine", "Appleton", "Waukesha", "Eau Claire", "Oshkosh", "Janesville", "West Allis", "La Crosse", "Sheboygan", "Wauwatosa", "Fond du Lac"],
  WY: ["Cheyenne", "Casper", "Laramie", "Gillette", "Rock Springs", "Sheridan", "Green River", "Evanston", "Riverton", "Jackson"],
  DC: ["Washington"]
};

// Helper functions to match the country-state-city API
export const State = {
  getStatesOfCountry: (countryCode) => {
    if (countryCode === "US") {
      return US_STATES;
    }
    return [];
  }
};

export const City = {
  getCitiesOfState: (countryCode, stateCode) => {
    if (countryCode === "US" && US_CITIES[stateCode]) {
      return US_CITIES[stateCode].map(name => ({ name, stateCode }));
    }
    return [];
  }
};

export const Country = {
  getAllCountries: () => {
    return [{ isoCode: "US", name: "United States" }];
  }
};

