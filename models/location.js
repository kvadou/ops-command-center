module.exports = (sequelize, DataTypes) => {
  const Location = sequelize.define("Location", {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    color: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "#000000",
    },
  });
  return Location;
};
