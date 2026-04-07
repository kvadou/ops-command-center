module.exports = (sequelize, DataTypes) => {
  const ColourGroup = sequelize.define("ColourGroup", {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    color: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  });

  return ColourGroup;
};
