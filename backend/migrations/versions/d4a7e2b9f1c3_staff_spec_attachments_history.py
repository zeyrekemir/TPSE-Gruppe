"""staff/student, robot specification, log procedure and attachments, status history

Revision ID: d4a7e2b9f1c3
Revises: c8c9c94128e1
Create Date: 2026-11-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4a7e2b9f1c3'
down_revision: Union[str, None] = 'c8c9c94128e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'member_type', sa.Enum('student', 'staff', name='membertype', native_enum=False, length=32),
            server_default='student', nullable=False,
        ))

    with op.batch_alter_table('robots', schema=None) as batch_op:
        batch_op.add_column(sa.Column('firmware', sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column('operating_system', sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column('equipment', sa.JSON(), server_default='[]', nullable=False))

    with op.batch_alter_table('experiment_logs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('procedure', sa.Text(), nullable=True))

    op.create_table('log_attachments',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('log_id', sa.Integer(), nullable=False),
    sa.Column('filename', sa.String(length=255), nullable=False),
    sa.Column('content_type', sa.String(length=128), nullable=False),
    sa.Column('size', sa.Integer(), nullable=False),
    sa.Column('data', sa.LargeBinary(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['log_id'], ['experiment_logs.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('log_attachments', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_log_attachments_log_id'), ['log_id'], unique=False)

    op.create_table('robot_status_changes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('robot_id', sa.Integer(), nullable=False),
    sa.Column('status', sa.Enum('available', 'maintenance', 'defect', 'retired', name='robotstatus', native_enum=False, length=32), nullable=False),
    sa.Column('changed_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['robot_id'], ['robots.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('robot_status_changes', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_robot_status_changes_changed_at'), ['changed_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_robot_status_changes_robot_id'), ['robot_id'], unique=False)

    # Uptime is counted from here on: one entry per existing robot with the status it has now.
    op.execute(
        "INSERT INTO robot_status_changes (robot_id, status, changed_at) "
        "SELECT id, status, CURRENT_TIMESTAMP FROM robots"
    )


def downgrade() -> None:
    with op.batch_alter_table('robot_status_changes', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_robot_status_changes_robot_id'))
        batch_op.drop_index(batch_op.f('ix_robot_status_changes_changed_at'))
    op.drop_table('robot_status_changes')

    with op.batch_alter_table('log_attachments', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_log_attachments_log_id'))
    op.drop_table('log_attachments')

    with op.batch_alter_table('experiment_logs', schema=None) as batch_op:
        batch_op.drop_column('procedure')

    with op.batch_alter_table('robots', schema=None) as batch_op:
        batch_op.drop_column('equipment')
        batch_op.drop_column('operating_system')
        batch_op.drop_column('firmware')

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('member_type')
