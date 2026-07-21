import jwt from "jsonwebtoken";

const authMiddleware = (req, res, next) => {

  try {

    const authHeader = req.headers.authorization;


    if (!authHeader) {
      return res.status(401).json({
        error: "No token"
      });
    }


    const token = authHeader.split(" ")[1];


    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );


    console.log("DECODED TOKEN:", decoded);


    req.user = decoded;


    next();


  } catch (err) {

    console.log("AUTH ERROR:", err.message);


    return res.status(401).json({
      error: "Invalid token"
    });

  }

};


export default authMiddleware;