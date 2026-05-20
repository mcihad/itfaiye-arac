async function main() {
  try {
    const res = await fetch('http://localhost:3000/api/db/fire_hydrants');
    const json = await res.json();
    console.log(`Fetched ${json.data?.length} hydrants from API.`);
    if (json.data && json.data.length > 0) {
      console.log('Sample hydrant from API:', json.data[0]);
      console.log('Last hydrant from API:', json.data[json.data.length - 1]);
    }
  } catch (err) {
    console.error(err);
  }
}
main();
