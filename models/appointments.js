module.exports = (sequelize, DataTypes) => {
  const Appointment = sequelize.define(
    "Appointment",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
      },
      serviceId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      start: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      end: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      indexes: [
        {
          unique: true,
          fields: ["id", "serviceId"],
        },
      ],
    }
  );

  Appointment.associate = function (models) {
    Appointment.belongsTo(models.Service, {
      as: "service",
      foreignKey: "serviceId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };

  return Appointment;
};
