import jwt from "jsonwebtoken";

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "No token"
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // decoded = { id: <userId>, iat, exp }
    req.user = decoded;

    next();
  } catch (err) {
    // Don't log err.message in production logs if you're piping logs
    // somewhere shared — it can leak token/timing info. Fine for local dev.
    return res.status(401).json({
      error: "Invalid or expired token"
    });
  }
};

export default authMiddleware;
