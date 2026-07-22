/**
 * India States/UTs → Districts dataset for the cascading location picker.
 *
 * Districts power a <datalist> (suggestions), so the lists don't need to be
 * exhaustive — users can still type a value that isn't listed, and the map is
 * resolved by geocoding the text (see lib/geocode.ts). City and Locality are
 * free text for the same reason (they're far too numerous to enumerate).
 */

export const STATES: string[] = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  // Union Territories
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

export const DISTRICTS: Record<string, string[]> = {
  "Andhra Pradesh": [
    "Anantapur", "Chittoor", "East Godavari", "Guntur", "Krishna", "Kurnool",
    "Nellore", "Prakasam", "Srikakulam", "Visakhapatnam", "Vizianagaram",
    "West Godavari", "YSR Kadapa",
  ],
  "Arunachal Pradesh": [
    "Tawang", "West Kameng", "East Kameng", "Papum Pare", "Lower Subansiri",
    "Upper Subansiri", "West Siang", "East Siang", "Lohit", "Changlang", "Tirap",
  ],
  Assam: [
    "Baksa", "Barpeta", "Bongaigaon", "Cachar", "Darrang", "Dhemaji", "Dhubri",
    "Dibrugarh", "Goalpara", "Golaghat", "Hailakandi", "Jorhat", "Kamrup",
    "Kamrup Metropolitan", "Karbi Anglong", "Karimganj", "Lakhimpur", "Nagaon",
    "Nalbari", "Sivasagar", "Sonitpur", "Tinsukia",
  ],
  Bihar: [
    "Araria", "Arwal", "Aurangabad", "Banka", "Begusarai", "Bhagalpur", "Bhojpur",
    "Buxar", "Darbhanga", "Gaya", "Gopalganj", "Jamui", "Jehanabad", "Katihar",
    "Khagaria", "Kishanganj", "Madhepura", "Madhubani", "Munger", "Muzaffarpur",
    "Nalanda", "Nawada", "Patna", "Purnia", "Rohtas", "Saharsa", "Samastipur",
    "Saran", "Sitamarhi", "Siwan", "Vaishali", "West Champaran", "East Champaran",
  ],
  Chhattisgarh: [
    "Balod", "Baloda Bazar", "Bastar", "Bilaspur", "Dhamtari", "Durg", "Janjgir-Champa",
    "Jashpur", "Korba", "Koriya", "Mahasamund", "Raigarh", "Raipur", "Rajnandgaon",
    "Surguja",
  ],
  Goa: ["North Goa", "South Goa"],
  Gujarat: [
    "Ahmedabad", "Amreli", "Anand", "Banaskantha", "Bharuch", "Bhavnagar", "Dahod",
    "Gandhinagar", "Jamnagar", "Junagadh", "Kheda", "Kutch", "Mehsana", "Morbi",
    "Navsari", "Panchmahal", "Patan", "Porbandar", "Rajkot", "Sabarkantha", "Surat",
    "Surendranagar", "Vadodara", "Valsad",
  ],
  Haryana: [
    "Ambala", "Bhiwani", "Faridabad", "Fatehabad", "Gurugram", "Hisar", "Jhajjar",
    "Jind", "Kaithal", "Karnal", "Kurukshetra", "Mahendragarh", "Nuh", "Palwal",
    "Panchkula", "Panipat", "Rewari", "Rohtak", "Sirsa", "Sonipat", "Yamunanagar",
  ],
  "Himachal Pradesh": [
    "Bilaspur", "Chamba", "Hamirpur", "Kangra", "Kinnaur", "Kullu", "Lahaul and Spiti",
    "Mandi", "Shimla", "Sirmaur", "Solan", "Una",
  ],
  Jharkhand: [
    "Bokaro", "Chatra", "Deoghar", "Dhanbad", "Dumka", "East Singhbhum", "Garhwa",
    "Giridih", "Godda", "Gumla", "Hazaribagh", "Jamtara", "Khunti", "Koderma",
    "Latehar", "Lohardaga", "Pakur", "Palamu", "Ramgarh", "Ranchi", "Sahebganj",
    "Seraikela Kharsawan", "Simdega", "West Singhbhum",
  ],
  Karnataka: [
    "Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban", "Bidar",
    "Chamarajanagar", "Chikkaballapur", "Chikkamagaluru", "Chitradurga", "Dakshina Kannada",
    "Davanagere", "Dharwad", "Gadag", "Hassan", "Haveri", "Kalaburagi", "Kodagu",
    "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur", "Ramanagara", "Shivamogga",
    "Tumakuru", "Udupi", "Uttara Kannada", "Vijayapura", "Yadgir",
  ],
  Kerala: [
    "Alappuzha", "Ernakulam", "Idukki", "Kannur", "Kasaragod", "Kollam", "Kottayam",
    "Kozhikode", "Malappuram", "Palakkad", "Pathanamthitta", "Thiruvananthapuram",
    "Thrissur", "Wayanad",
  ],
  "Madhya Pradesh": [
    "Balaghat", "Betul", "Bhind", "Bhopal", "Chhatarpur", "Chhindwara", "Damoh",
    "Dewas", "Dhar", "Guna", "Gwalior", "Hoshangabad", "Indore", "Jabalpur", "Katni",
    "Khandwa", "Khargone", "Mandsaur", "Morena", "Narsinghpur", "Neemuch", "Rajgarh",
    "Ratlam", "Rewa", "Sagar", "Satna", "Sehore", "Seoni", "Shivpuri", "Ujjain", "Vidisha",
  ],
  Maharashtra: [
    "Ahmednagar", "Akola", "Amravati", "Aurangabad", "Beed", "Bhandara", "Buldhana",
    "Chandrapur", "Dhule", "Gadchiroli", "Gondia", "Hingoli", "Jalgaon", "Jalna",
    "Kolhapur", "Latur", "Mumbai City", "Mumbai Suburban", "Nagpur", "Nanded", "Nandurbar",
    "Nashik", "Osmanabad", "Palghar", "Parbhani", "Pune", "Raigad", "Ratnagiri", "Sangli",
    "Satara", "Sindhudurg", "Solapur", "Thane", "Wardha", "Washim", "Yavatmal",
  ],
  Manipur: [
    "Bishnupur", "Chandel", "Churachandpur", "Imphal East", "Imphal West", "Senapati",
    "Tamenglong", "Thoubal", "Ukhrul",
  ],
  Meghalaya: [
    "East Garo Hills", "East Khasi Hills", "Jaintia Hills", "Ri Bhoi", "South Garo Hills",
    "West Garo Hills", "West Khasi Hills",
  ],
  Mizoram: ["Aizawl", "Champhai", "Kolasib", "Lawngtlai", "Lunglei", "Mamit", "Saiha", "Serchhip"],
  Nagaland: [
    "Dimapur", "Kiphire", "Kohima", "Longleng", "Mokokchung", "Mon", "Peren", "Phek",
    "Tuensang", "Wokha", "Zunheboto",
  ],
  Odisha: [
    "Angul", "Balangir", "Balasore", "Bargarh", "Bhadrak", "Cuttack", "Dhenkanal",
    "Ganjam", "Jagatsinghpur", "Jajpur", "Jharsuguda", "Kalahandi", "Kendrapara",
    "Keonjhar", "Khordha", "Koraput", "Mayurbhanj", "Nayagarh", "Puri", "Rayagada",
    "Sambalpur", "Sundargarh",
  ],
  Punjab: [
    "Amritsar", "Barnala", "Bathinda", "Faridkot", "Fatehgarh Sahib", "Fazilka",
    "Ferozepur", "Gurdaspur", "Hoshiarpur", "Jalandhar", "Kapurthala", "Ludhiana",
    "Mansa", "Moga", "Mohali", "Muktsar", "Pathankot", "Patiala", "Rupnagar",
    "Sangrur", "Tarn Taran",
  ],
  Rajasthan: [
    "Ajmer", "Alwar", "Banswara", "Barmer", "Bharatpur", "Bhilwara", "Bikaner", "Bundi",
    "Chittorgarh", "Churu", "Dausa", "Dholpur", "Dungarpur", "Hanumangarh", "Jaipur",
    "Jaisalmer", "Jalore", "Jhalawar", "Jhunjhunu", "Jodhpur", "Karauli", "Kota",
    "Nagaur", "Pali", "Pratapgarh", "Rajsamand", "Sawai Madhopur", "Sikar", "Sirohi",
    "Sri Ganganagar", "Tonk", "Udaipur",
  ],
  Sikkim: ["East Sikkim", "North Sikkim", "South Sikkim", "West Sikkim"],
  "Tamil Nadu": [
    "Ariyalur", "Chengalpattu", "Chennai", "Coimbatore", "Cuddalore", "Dharmapuri",
    "Dindigul", "Erode", "Kanchipuram", "Kanyakumari", "Karur", "Krishnagiri", "Madurai",
    "Nagapattinam", "Namakkal", "Nilgiris", "Perambalur", "Pudukkottai", "Ramanathapuram",
    "Salem", "Sivaganga", "Thanjavur", "Theni", "Thoothukudi", "Tiruchirappalli",
    "Tirunelveli", "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Vellore", "Viluppuram",
    "Virudhunagar",
  ],
  Telangana: [
    "Adilabad", "Bhadradri Kothagudem", "Hyderabad", "Jagtial", "Jangaon", "Karimnagar",
    "Khammam", "Mahbubnagar", "Mancherial", "Medak", "Medchal–Malkajgiri", "Nalgonda",
    "Nizamabad", "Peddapalli", "Rangareddy", "Sangareddy", "Siddipet", "Suryapet",
    "Warangal Rural", "Warangal Urban",
  ],
  Tripura: [
    "Dhalai", "Gomati", "Khowai", "North Tripura", "Sepahijala", "South Tripura",
    "Unakoti", "West Tripura",
  ],
  "Uttar Pradesh": [
    "Agra", "Aligarh", "Allahabad", "Ambedkar Nagar", "Amroha", "Ayodhya", "Azamgarh",
    "Bahraich", "Ballia", "Banda", "Bareilly", "Basti", "Bijnor", "Budaun", "Bulandshahr",
    "Deoria", "Etah", "Etawah", "Faizabad", "Farrukhabad", "Fatehpur", "Firozabad",
    "Ghaziabad", "Ghazipur", "Gonda", "Gorakhpur", "Hapur", "Hardoi", "Jaunpur", "Jhansi",
    "Kanpur Nagar", "Kanpur Dehat", "Lakhimpur Kheri", "Lalitpur", "Lucknow", "Mathura",
    "Meerut", "Mirzapur", "Moradabad", "Muzaffarnagar", "Noida (Gautam Buddh Nagar)",
    "Pilibhit", "Pratapgarh", "Raebareli", "Rampur", "Saharanpur", "Sant Kabir Nagar",
    "Shahjahanpur", "Sitapur", "Sultanpur", "Unnao", "Varanasi",
  ],
  Uttarakhand: [
    "Almora", "Bageshwar", "Chamoli", "Champawat", "Dehradun", "Haridwar", "Nainital",
    "Pauri Garhwal", "Pithoragarh", "Rudraprayag", "Tehri Garhwal", "Udham Singh Nagar",
    "Uttarkashi",
  ],
  "West Bengal": [
    "Alipurduar", "Bankura", "Birbhum", "Cooch Behar", "Dakshin Dinajpur", "Darjeeling",
    "Hooghly", "Howrah", "Jalpaiguri", "Jhargram", "Kalimpong", "Kolkata", "Malda",
    "Murshidabad", "Nadia", "North 24 Parganas", "Paschim Bardhaman", "Paschim Medinipur",
    "Purba Bardhaman", "Purba Medinipur", "Purulia", "South 24 Parganas", "Uttar Dinajpur",
  ],
  "Andaman and Nicobar Islands": ["Nicobar", "North and Middle Andaman", "South Andaman"],
  Chandigarh: ["Chandigarh"],
  "Dadra and Nagar Haveli and Daman and Diu": ["Dadra and Nagar Haveli", "Daman", "Diu"],
  Delhi: [
    "Central Delhi", "East Delhi", "New Delhi", "North Delhi", "North East Delhi",
    "North West Delhi", "Shahdara", "South Delhi", "South East Delhi", "South West Delhi",
    "West Delhi",
  ],
  "Jammu and Kashmir": [
    "Anantnag", "Bandipora", "Baramulla", "Budgam", "Doda", "Ganderbal", "Jammu",
    "Kathua", "Kishtwar", "Kulgam", "Kupwara", "Poonch", "Pulwama", "Rajouri", "Ramban",
    "Reasi", "Samba", "Shopian", "Srinagar", "Udhampur",
  ],
  Ladakh: ["Kargil", "Leh"],
  Lakshadweep: ["Lakshadweep"],
  Puducherry: ["Karaikal", "Mahe", "Puducherry", "Yanam"],
};

export const districtsForState = (state: string): string[] => DISTRICTS[state] ?? [];
