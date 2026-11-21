// Shared by the email adapters: "UniMentor <no-reply@x.edu>" -> { name, email }.
function parseAddress(address) {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(address);
  return match ? { name: match[1] || undefined, email: match[2] } : { email: address.trim() };
}

module.exports = { parseAddress };
