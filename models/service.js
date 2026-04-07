module.exports = (sequelize, DataTypes) => {
  const Service = sequelize.define("Service", {
    serviceId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    name: DataTypes.STRING,
    description: DataTypes.STRING,
    location: DataTypes.STRING,
    price: DataTypes.FLOAT,
    type: DataTypes.STRING,
    colourGroup: DataTypes.STRING,

    labelId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    labelName: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    image: DataTypes.STRING,
    dft_max_srs: DataTypes.INTEGER,
    rcrs: DataTypes.INTEGER,
    publicVisible: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    studentDiscountEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    studentDiscountPercent: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    staffDiscountEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    staffDiscountPercentMonthly: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 20,
    },
    staffDiscountPercentTerm: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 20,
    },
  });

  Service.associate = function (models) {
    Service.hasMany(models.Appointment, {
      as: "appointments",
      foreignKey: "serviceId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };

  return Service;
};
