const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const passpostLocalMongooes = require("passport-local-mongoose");

const userSchema = new Schema({
    email: {
        type: String,
        required: true
    }
});

userSchema.plugin(passpostLocalMongooes);
module.exports = mongoose.model("User", userSchema);