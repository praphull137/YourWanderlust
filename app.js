if(process.env.NODE_ENV != "production"){
    require("dotenv").config();
}
const express = require("express");
const app = express();
let port = 8080;
const path = require("path");
const mongoose = require("mongoose");
const ejsMate = require("ejs-mate");
const Listing = require("./models/listing.js");
const methodOverride = require("method-override");
const wrapAsync = require("./utils/wrapAsync.js");
const ExpressError = require("./utils/expressError.js");
const MONGO_URL = "mongodb://localhost:27017/yourWonderlust";
const {listingSchema, reviewSchema} =require("./schema.js");
const Review = require("./models/review.js");
const session = require("express-session");
const flash = require("connect-flash");
const passport = require("passport");
const localStrategy = require("passport-local");
const User = require("./models/user.js");
const {isLoggedIn, saveRedirectUrl, isOwner, validateReview,isReviewAuthor} = require("./middleware.js");
const multer = require("multer");
const {storage} = require("./cloudconfig.js");
const upload = multer({storage: storage});
// const dbURL = process.env.ATLASDB_URL;
main()
    .then(() => {
        console.log("Connected to DB!");
    })
    .catch((err) => {
        console.log(err);
    });

async function main() {
    await mongoose.connect(MONGO_URL);
}

app.use(express.static(path.join(__dirname,"/public")));
app.use(express.urlencoded({extended: true}));
app.use(methodOverride("_method"));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.engine("ejs", ejsMate);

const sessionOpt = {
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOlny: true,
    },
};



app.use(session(sessionOpt));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new localStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());


app.use((req, res,  next) => {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    res.locals.currUser = req.user;
    next();
});

// creating fake user
app.use("/demouser", async (req, res) => {
let fakeUser = new User({
    email: "fakeuser@gmail.com",
    username: "fakeuser123",
});
   let registeredUser = await User.register(fakeUser, "Hello World");
   res.send(registeredUser);
});

// app.get("/", (req, res) => {
//     res.send("App is working");
// });

//index route
app.get("/listings", wrapAsync( async (req, res) =>{
    const allListings = await Listing.find({});
    res.render("listings/index",{allListings});
}));



//new route
app.get("/listings/new", isLoggedIn, wrapAsync(async(req, res) => {
    // let {id} = req.params;
    // const listing = await Listing.findById(id);
    res.render("listings/new");
}));


//show route
app.get("/listings/:id", wrapAsync(async (req, res) => {
    let {id} = req.params;
    const listing = await Listing.findById(id)
    .populate({
        path: "reviews",
        populate: { path: "author" }
    })
    .populate("owner");
    if(!listing){
        req.flash("error", "The listing you are searching for does not exist!!");
        res.redirect("/listings");
    }
    res.render("listings/show",{listing});
})); 


//create newListing
app.post("/listings",isLoggedIn,upload.single("listing['image']"), wrapAsync( async(req, res) => {
    // let result = listingSchema.validate(req.body);
    // console.log(result);
    // if(result.error){
    //     throw new ExpressError(400, result.error);
    // }
    if (!req.file) {
        req.flash("error", "Image upload failed. Please try again.");
        return res.redirect("/listings");
    }
    let {url} = req.file.path;
    let {filename} = req.file.filename;
    const newListing = new Listing(req.body.listing);
    newListing.owner = req.user._id;
    newListing.image = {url, filename};
    await newListing.save();
    req.flash("success", "New listing created successfully!");
    res.redirect("/listings");
    console.log(newListing);
}));


//edit route
app.get("/listings/:id/edit",isLoggedIn, isOwner,wrapAsync(async (req,res) => {
    let {id} = req.params;
    const listing = await Listing.findById(id);
    res.render("listings/edit",{listing});
}));

//edit listing
app.put("/listings/:id",isLoggedIn, isOwner, wrapAsync(async (req, res) => {
    let {id} = req.params;
    if(!req.body.listing){
        throw new ExpressError(400, "Send a valid data for listing");
    }
    const editedListing = await Listing.findByIdAndUpdate(id,{... req.body.listing});
    req.flash("success", "listing updated!");
   
    res.redirect(`/listings/${id}`);
}));

//delete listing
app.delete("/listings/:id",isLoggedIn,isOwner, wrapAsync(async (req, res) => {
    let {id} = req.params;
    const deletedListing = await Listing.findByIdAndDelete(id);
    req.flash("success", "listing deleted successfully!");
    res.redirect(`/listings`);
}));


// review route

app.post('/listings/:id/reviews', isLoggedIn, async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);
        const review = new Review(req.body.review);  // Assuming req.body.review contains the review data
        review.author = req.user._id;  // Associating the review with the logged-in user
        listing.reviews.push(review); // Push the review into the listing's reviews array
        await review.save();  // Save the review
        await listing.save();  // Save the listing with the new review
        req.flash('success', 'Review added successfully!');
        res.redirect(`/listings/${listing._id}`);
    } catch (err) {
        console.log(err);
        req.flash('error', 'Something went wrong!');
        res.redirect(`/listings/${req.params._id}`);
    }
});

//delete review
app.delete("/listings/:id/reviews/:reviewId",isLoggedIn,isReviewAuthor, wrapAsync(async (req, res) => {
    let {id, reviewId} = req.params;
    await Listing.findByIdAndUpdate(id, {$pull: {reviews: reviewId}});

    await Review.findByIdAndDelete(reviewId);
    req.flash("success", "review deleted!");
    res.redirect(`/listings/${id}`);
}));


//user signup route
app.get("/signup", (req, res) => {
    res.render("users/singup.ejs");
});

//user post request signup

app.post("/signup",wrapAsync( async (req, res) => {
    try{
        let {username, email, password} = req.body;
        const newUser = new User({email, username});
        const registeredUser  = await User.register(newUser, password);
        console.log(registeredUser);
        req.login(registeredUser, (err) => {
            if(err){
                return next(err);
            }
            req.flash("success", "Welcome to YourWanderLust!");
            res.redirect("/listings");
        })
    }catch(e){
        req.flash("error", e.message);
        res.redirect("/signup");
    }
  
}))


// login route

app.get("/login", (req, res) => {
    res.render("users/login");
});

// login post route
app.post("/login",saveRedirectUrl, passport.authenticate("local", {failureRedirect: "/login", failureFlash: true}), (req, res) => {
    req.flash("success", "Welcome back to YourWanderLust");
    let redirectUrl = res.locals.redirectUrl || "/listings";
    res.redirect(redirectUrl);
});


//logout route
app.get("/logout", (req, res, next) =>{
    req.logout((err) =>{
    if(err){
        return next(err);
    }
        req.flash("success", "You are successfully logged out!");
        res.redirect("/listings");
    });
});

// app.get("/testlisting", async (req, res) => {
//     let newListing = new Listing({
//         title: "New Villa",
//         description: "Beaultiful gerden and big swimming pool",
//         price: 1200,
//         location: "Gurugram",
//         country: "India"
//     });

//     await newListing.save();
//     console.log("data saved successfully");
//     res.send("Successful");
// });

// app.all("*", (req, res, next) => {
//     next(new ExpressError(404, "Page not found!"));
//   });

app.use((err,req, res, next) =>{
    let { statusCode = 500, message = "Something went wrong!" } = err;
    res.render("error.ejs", {message});
    // res.status(statusCode).send(message);
});
app.listen(port, () =>{
    console.log(`Listening to the port ${port}`);
});

