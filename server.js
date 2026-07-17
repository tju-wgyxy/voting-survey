import app from "./app.js";

const PORT = process.env.PORT || 3400;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running at http://localhost:" + PORT);
});
